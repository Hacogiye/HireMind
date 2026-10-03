// lib/services.js — các tính năng dựa trên ngữ cảnh CV+JD.
// Đã có: cvContext + rewriteCV 2 chế độ (reshape / addskills) — điểm nhấn giám khảo.
// TODO(mốc sau): generateCoverLetter (letterhead, ≤3 số liệu, CTA tự tin),
// chatTurn + interviewSystem + parser lượt phỏng vấn.
const { chatJson } = require('./ai');

// Gom CV sạch + JD + kết quả phân tích — ngữ cảnh dùng chung mọi prompt hội thoại
function cvContext(session) {
  const cv = session.cv || {};
  const jd = session.jd;
  const r = session.result || {};
  const alts = (r.alternativePaths || []).map(a => a.role);
  return `=== CV ỨNG VIÊN: ${cv.candidateName || ''} (${session.meta?.targetRole || ''} | ${session.meta?.experienceLevel || ''}) ===
${(cv.cleanedCv || '').slice(0, 10000)}

${jd ? `=== TIN TUYỂN DỤNG MỤC TIÊU ===
Vị trí: ${jd.title} tại ${jd.company || '?'} (${jd.location || '?'})
Yêu cầu bắt buộc: ${JSON.stringify(jd.mustHave)}
Yêu cầu nên có: ${JSON.stringify(jd.niceToHave || [])}
Điểm khớp ATS: ${r.match?.matchScore ?? '?'}/100 — ${r.match?.verdict || ''}
Kỹ năng còn thiếu: ${JSON.stringify((r.match?.missing || []).map(m => m.requirement))}` : '=== KHÔNG CÓ JD ==='}

=== PHÂN TÍCH ĐÃ CÓ ===
Điểm tổng: ${r.overallScore ?? '?'}/100
Tóm tắt: ${r.summary || ''}
Điểm yếu chính: ${JSON.stringify((r.weaknesses || []).map(w => w.point))}
Lộ trình: ${JSON.stringify((r.roadmap || []).map(s => `${s.step}. ${s.skill} (${s.duration})`))}
${alts.length ? `HƯỚNG ĐI KHÁC AI ĐÃ ĐỀ XUẤT (CV này có lợi thế hơn ở đây): ${alts.join(' ; ')}` : ''}`;
}

// ---------- VIẾT LẠI CV — 2 CHẾ ĐỘ ----------
// reshape (mặc định): cấu trúc lại + diễn lại mạnh hơn + cắt gọn sáo rỗng — KHÔNG bịa.
// addskills: thêm mục "## KỸ NĂNG ĐANG BỔ SUNG" cuối CV với ghi chú trung thực —
//   CẤM nhúng kỹ năng còn thiếu vào kinh nghiệm như thể đã làm.
async function rewriteCV(session, opts = {}) {
  const mode = opts.mode === 'addskills' ? 'addskills' : 'reshape';
  const cv = session.cv || {};
  const jd = session.jd;
  const r = session.result || {};
  const missing = (r.match?.missing || []).map(m => `- [${m.severity || 'nice'}] ${m.requirement}${m.note ? ` (${m.note})` : ''}`).join('\n') || '(không có)';
  const weaknesses = (r.weaknesses || []).map(w => `- ${w.point}${w.fix ? ` → ${w.fix}` : ''}`).join('\n') || '(không có)';
  const improvements = (r.improvements || []).map(im => `- ${im.title}: ${im.detail}`).join('\n') || '(không có)';
  const roadmap = (r.roadmap || []).map(st => `${st.step}. ${st.skill}`).join('; ') || '(không có)';

  const prompt = `Bạn là chuyên gia tuyển dụng kiêm chuyên viên viết CV dày dạn. Nhiệm vụ: VIẾT LẠI CV của ứng viên để tối ưu cho vị trí mục tiêu — dựa trên toàn bộ phân tích đã có dưới đây.

=== CV HIỆN TẠI (đã hợp nhất) ===
${(cv.cleanedCv || '').slice(0, 12000)}

=== VỊ TRÍ MỤC TIÊU ===
${session.meta?.targetRole || 'chưa rõ'} (${session.meta?.experienceLevel || 'chưa rõ'})
${jd ? `JD: ${jd.title || ''}${jd.company ? ` — ${jd.company}` : ''}
Yêu cầu bắt buộc: ${JSON.stringify(jd.mustHave || [])}
Yêu cầu nên có: ${JSON.stringify(jd.niceToHave || [])}` : '(không có JD cụ thể — tối ưu theo vị trí mục tiêu)'}

=== PHÂN TÍCH CÓ SẴN (dùng làm chỉ dẫn sửa) ===
Điểm CV: ${r.overallScore ?? '?'}/100${jd ? ` · Điểm khớp ATS: ${r.match?.matchScore ?? '?'}/100` : ''}
Còn thiếu so với JD: ${missing}
Điểm yếu cần sửa: ${weaknesses}
Gợi ý cải thiện: ${improvements}
Lộ trình học (để biết gap nào phải học thêm): ${roadmap}

NGUYÊN TẮC BẮT BUỘC (nghiêm ngặt):
1. TUYỆT ĐỐI KHÔNG BỊA: không thêm kinh nghiệm, dự án, chứng chỉ, số liệu, kỹ năng KHÔNG có trong CV gốc. Mọi sự kiện trong CV mới phải có gốc trong CV gốc.
2. Giữ NGUYÊN thông tin liên hệ thật của ứng viên (số điện thoại, email, địa chỉ) từ CV gốc — tuyệt đối không thay bằng placeholder kiểu "[thay bằng email]".
3. Chỉ RESHAPE: sắp xếp lại thứ tự mục/bullet (cái liên quan vị trí nhất lên đầu), diễn lại câu yếu thành mạnh hơn nhưng vẫn đúng sự thật, nhấn mạnh từ khóa khớp JD khi CV thật sự có năng lực đó. Bullet kinh nghiệm viết theo công thức X-Y-Z: đạt được X, đo lường bằng Y, bằng cách làm Z — CHỈ dùng số liệu đã có thật trong CV, không suy diễn số mới. CẮT GỌN chi tiết thừa, trùng lặp, câu sáo rỗng — mỗi bullet phải đáng chỗ của nó, CV phải nổi bật và thực dụng trong mắt nhà tuyển dụng.
4. Được viết lại mục tiêu nghề nghiệp nhắm đúng vị trí mục tiêu.
5. Giữ Markdown nhẹ: ## cho tên mục, bullet "-"; **đậm** cụm chốt. Độ dài tương đương CV gốc (±30%).

${mode === 'addskills' ? `CHẾ ĐỘ BỔ SUNG KỸ NĂNG (ngoài 5 nguyên tắc trên):
- Ở CUỐI CV thêm MỘT mục "## KỸ NĂNG ĐANG BỔ SUNG" liệt kê các kỹ năng còn thiếu (lấy từ "Còn thiếu so với JD" và lộ trình học), mỗi kỹ năng kèm ghi chú trung thực trong ngoặc: (đang học) / (cần rèn — có nền tảng liên quan) / (mục tiêu 1 tháng tới).
- TUYỆT ĐỐI không nhúng các kỹ năng này vào kinh nghiệm/dự án như thể ứng viên đã làm — đó là bịa.
- Mỗi kỹ năng được thêm → 1 item changes với type "add", why nói rõ ứng viên cần làm gì để kỹ năng này trở thành thật.
- unfixableGaps vẫn liệt kê những thứ không thể tự học nhanh (bằng cấp, số năm kinh nghiệm).` : `CHẾ ĐỘ CẤU TRÚC (mặc định):
- Kỹ năng còn thiếu KHÔNG được "có mặt" trong CV — liệt kê vào unfixableGaps để đưa sang lộ trình học.`}

Trả về CHỈ một JSON object:
{
  "note": "1 câu tóm tắt hướng tiếp cận của bạn khi viết lại",
  "rewrittenCv": "toàn bộ CV đã viết lại, dạng Markdown, bắt đầu bằng tên ứng viên",
  "changes": [ { "type": "reorder|rephrase|emphasize|format${mode === 'addskills' ? '|add' : ''}", "where": "mục/dòng nào", "before": "bản gốc (tóm tắt)", "after": "bản mới (tóm tắt)", "why": "lý do thay đổi giúp gì" } ],
  "unfixableGaps": [ { "skill": "kỹ năng còn thiếu", "why": "vì sao viết lại CV không giải quyết được" } ]
}
Giới hạn: changes tối đa 8 mục tiêu biểu nhất, unfixableGaps tối đa 4.`;

  // maxTokens 10000 + CV dài → call này hay vượt 120s mặc định — nới lên 180s
  const result = await chatJson([{ role: 'user', content: prompt }], { maxTokens: 10000, temperature: 0.5, timeoutMs: 180000 });

  // Hậu xử lý: model có thói quen che thông tin liên hệ thành placeholder
  // ("[Điền email...]", "[thay bằng số điện thoại]") dù prompt cấm — phục hồi
  // giá trị THẬT từ CV gốc (deterministic, không dựa vào model).
  try {
    const orig = cv.cleanedCv || '';
    const email = (orig.match(/[\w.+-]+@[\w-]+\.[\w.-]+/) || [])[0];
    const phone = (orig.match(/\(\d{3,4}\)(?:[\s.\-]?\d){7,9}/) || orig.match(/(?:\+84|0)(?:[\s.\-]?\d){8,10}/) || [])[0];
    if (typeof result.rewrittenCv === 'string' && (email || phone)) {
      result.rewrittenCv = result.rewrittenCv.replace(/\[([^\]\n]{2,60})\]/g, (m, inner) => {
        const k = inner.toLowerCase();
        if (email && /email|mail/.test(k)) return email;
        if (phone && /điện thoại|di động|phone|hotline|số dt|tel/.test(k)) return phone;
        return m; // placeholder khác — giữ nguyên
      });
    }
  } catch { /* giữ nguyên nếu lỗi */ }

  // Ép chuẩn tên mục bổ sung — AI hay gõ sai chính tả ("BỐ SUNG", "BỔ SUNG KỸ NĂNG"…)
  // khiến UI không nhận diện được mục này
  if (mode === 'addskills' && typeof result.rewrittenCv === 'string') {
    result.rewrittenCv = result.rewrittenCv.replace(
      /^#{2,3}\s*KỸ NĂNG.*$/im,
      '## KỸ NĂNG ĐANG BỔ SUNG'
    );
  }

  return result;
}

module.exports = { cvContext, rewriteCV };
