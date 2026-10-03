// lib/pipeline.js — pipeline xử lý NỀN sau upload (user thoát trang vẫn chạy).
// Giờ 2: session helpers + withRetry + extractContent (trích xuất nội dung CV).
// Giờ 2:35: withSession/patchSession (hàng đợi ghi theo phiên) + processSession
// (orchestration 4 bước: extract → validate → jd → analyze).
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { ocrImage, chatJson } = require('./ai');
const { fetchJD } = require('./jd');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SESSION_RE = /^[a-f0-9]{12}$/;
const MAX_CV_CHARS = 14000; // giới hạn đầu vào AI — CV dài hơn cắt, tránh tràn token
const MAX_JD_CHARS = 9000;

// Regex chặt là RÀO CHẮN PATH TRAVERSAL — mọi đường dẫn phiên đi qua đây
function sessionDir(id) {
  if (!SESSION_RE.test(id)) {
    const e = new Error('Phiên không hợp lệ');
    e.status = 400;
    throw e;
  }
  return path.join(DATA_DIR, id);
}

function readSession(id) {
  return JSON.parse(fs.readFileSync(path.join(sessionDir(id), 'session.json'), 'utf8'));
}

// Atomic write: ghi file tạm rồi rename — crash/disk-full giữa chừng không thể
// để lại session.json bị cắt cụt (file hỏng = phiên chết vĩnh viễn).
// Windows: rename có thể EPERM khi file đích đang bị đọc (poll/antivirus) —
// thử lại 1 lần rồi fallback ghi đè thường (vẫn an toàn hơn việc không atomic).
function writeSession(session) {
  const file = path.join(sessionDir(session.id), 'session.json');
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(session, null, 2));
  try {
    fs.renameSync(tmp, file);
  } catch (e) {
    try {
      fs.renameSync(tmp, file);
    } catch (e2) {
      fs.copyFileSync(tmp, file);
      fs.unlinkSync(tmp);
    }
  }
}

// HÀNG ĐỘI GHI THEO PHIÊN: mọi mutation session.json phải đi qua đây.
// Pipeline + chat + rewrite + cover letter ghi chồng nhau mà read-modify-write
// trực tiếp sẽ MẤT dữ liệu. Hàng đợi chuỗi promise theo id — luôn đọc mới nhất
// bên trong, ghi xong mới nhả cho job kế tiếp.
// LƯU Ý: mutator KHÔNG ĐƯỢC gọi withSession/patchSession cùng id bên trong
// (nest = chờ chính mình = kẹt hàng đợi vĩnh viễn).
const writeQueues = new Map();
function withSession(id, mutator) {
  const tail = (writeQueues.get(id) || Promise.resolve()).catch(() => {});
  const job = tail.then(async () => {
    const s = readSession(id);
    const out = await mutator(s);
    writeSession(s);
    return out === undefined ? s : out;
  });
  const tracked = job.catch(() => {});
  writeQueues.set(id, tracked);
  tracked.then(() => {
    if (writeQueues.get(id) === tracked) writeQueues.delete(id);
  });
  return job;
}

// Patch thuận tiện: ghép object vào session qua hàng đợi
function patchSession(id, patch) {
  return withSession(id, (s) => Object.assign(s, patch));
}

// Retry có kỷ luật: tôn trọng e.noRetry (4xx trừ 429 — retry không thể giúp,
// ngừng ngay để không đốt tiền/tiếng đợi người dùng).
async function withRetry(fn, { tries = 3, baseMs = 1500 } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (e.noRetry) break;
      if (i < tries - 1) await new Promise(r => setTimeout(r, baseMs * (i + 1)));
    }
  }
  throw lastErr;
}

// ---------- Trích xuất nội dung CV từ mọi định dạng ----------
// Ưu tiên text client gửi kèm (pdf.js trên trình duyệt); server đọc .docx/.txt,
// parse PDF khi client không gửi text, OCR ảnh scan tuần tự (đỡ áp lực API).
async function extractContent(session) {
  const dir = path.join(sessionDir(session.id), 'uploads');
  const parts = [];      // { source, text }
  const needsOcr = [];   // { base64, mime, name? }
  const warnings = [];   // thông báo thân thiện hiện sau này

  // Client có thể gửi sẵn text PDF + ảnh các trang scan (pdf.js)
  if (typeof session.clientPdfText === 'string' && session.clientPdfText.trim().length > 150) {
    parts.push({ source: 'PDF (trình duyệt)', text: session.clientPdfText.trim() });
  }
  if (Array.isArray(session.clientPdfImages)) {
    needsOcr.push(...session.clientPdfImages.slice(0, 8)); // server chỉ OCR tối đa 8 trang
  }

  for (const f of session.files) {
    const full = path.join(dir, f.stored);
    const ext = path.extname(f.name).toLowerCase();
    try {
      if (ext === '.txt' || ext === '.md') {
        const text = fs.readFileSync(full, 'utf8');
        if (text.trim()) parts.push({ source: f.name, text: text.trim() });
      } else if (ext === '.docx') {
        const { value } = await mammoth.extractRawText({ path: full });
        if (value.trim()) parts.push({ source: f.name, text: value.trim() });
        else warnings.push(`${f.name}: file DOCX không có nội dung text`);
      } else if (ext === '.pdf') {
        // text đã xử lý qua client phía trên; client không gửi → thử parse server
        if (!parts.some(p => p.source === 'PDF (trình duyệt)')) {
          try {
            const pdfParse = require('pdf-parse'); // lazy — tránh side-effect khi boot
            const data = await pdfParse(fs.readFileSync(full));
            if (data.text && data.text.trim().length > 150) {
              parts.push({ source: f.name, text: data.text.trim() });
            } else {
              warnings.push(`${f.name}: PDF có vẻ là file scan — đang dùng OCR`);
            }
          } catch (e) {
            warnings.push(`${f.name}: không đọc được PDF trực tiếp (${e.message.slice(0, 80)})`);
          }
        }
      } else if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp'].includes(ext)) {
        const mime = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp' }[ext] || 'image/png';
        needsOcr.push({ base64: fs.readFileSync(full).toString('base64'), mime, name: f.name });
      } else {
        warnings.push(`${f.name}: định dạng không hỗ trợ, đã bỏ qua`);
      }
    } catch (e) {
      warnings.push(`${f.name}: lỗi khi xử lý (${e.message.slice(0, 80)})`);
    }
  }

  // OCR ảnh tuần tự (đỡ áp lực API, dễ báo warning theo từng trang)
  for (let i = 0; i < needsOcr.length; i++) {
    const img = needsOcr[i];
    try {
      const text = await withRetry(() => ocrImage(img.base64, img.mime), { tries: 3 });
      if (text.trim()) {
        parts.push({ source: img.name || `Trang ảnh ${i + 1} (OCR)`, text: text.trim() });
      } else {
        warnings.push(`${img.name || `Ảnh ${i + 1}`}: không trích xuất được nội dung`);
      }
    } catch (e) {
      warnings.push(`${img.name || `Ảnh ${i + 1}`}: OCR thất bại (${e.message.slice(0, 80)})`);
    }
  }

  // Dọn payload lớn khỏi session — nếu giữ lại, MỌI lần ghi session.json sau này
  // (chat, rewrite, stage update) đều re-serialize vài MB base64 vô ích.
  delete session.clientPdfText;
  delete session.clientPdfImages;

  return { parts, warnings };
}

// ---------- Bước 2: AI validate + gộp CV ----------
async function validateAndStructure(parts) {
  const combined = parts.map(p => `=== ${p.source} ===\n${p.text}`).join('\n\n');
  const prompt = `Bạn là hệ thống phân tích tài liệu tuyển dụng. Dưới đây là nội dung từ hồ sơ người dùng (tải file lên, OCR ảnh, hoặc tự điền khi chưa có file CV — nội dung tự điền vẫn là CV hợp lệ nếu có thông tin ứng viên).

${combined.slice(0, MAX_CV_CHARS)}

NHIỆM VỤ:
1. Xác định đây có phải là CV/Sơ yếu lý lịch của MỘT người hay không (thông tin học vấn/kinh nghiệm/kỹ năng của một ứng viên). Dữ liệu nhập tay lỏng lẻo vẫn tính là CV nếu nói về một người thật.
2. Nếu có nhiều phần CV, hãy ghép chúng thành MỘT CV hoàn chỉnh theo thứ tự logic.
3. Trích xuất thông tin có cấu trúc từ CV.

Trả về CHỈ một JSON object theo đúng schema:
{
  "isCv": boolean,
  "reason": "nếu không phải CV, giải thích ngắn gọn bằng tiếng Việt",
  "multiplePeople": boolean,
  "candidateName": "tên ứng viên",
  "candidateTitle": "chức danh hiện tại (vd: Kỹ sư phần mềm, Sinh viên mới ra trường)",
  "experienceYears": number,
  "cleanedCv": "toàn bộ nội dung CV đã được dọn sạch và hợp nhất, dạng Markdown, giữ nguyên thông tin gốc",
  "extractedSkills": ["kỹ năng kỹ thuật/tools"],
  "hasProjects": boolean,
  "hasCertifications": boolean,
  "sections": ["Mục tiêu", "Kinh nghiệm"]
}`;

  const result = await withRetry(() => chatJson([{ role: 'user', content: prompt }], { maxTokens: 6000, temperature: 0.2 }));
  if (!result || typeof result.isCv !== 'boolean') throw new Error('AI trả về kết quả validate không hợp lệ');
  return result;
}

// ---------- Bước 3a: cấu trúc JD ----------
async function structureJD(jdText, url) {
  const prompt = `Bạn là hệ thống phân tích tin tuyển dụng. Đây là nội dung được tải từ: ${url || '(người dùng dán thủ công)'}

${jdText.slice(0, MAX_JD_CHARS)}

NHIỆM VỤ: Trích xuất thông tin tin tuyển dụng có cấu trúc. Bỏ qua navigation, footer, quảng cáo, nội dung site không liên quan.

Trả về CHỈ một JSON object:
{
  "title": "tên vị trí tuyển dụng",
  "company": "tên công ty (nếu tìm thấy)",
  "location": "địa điểm",
  "salary": "mức lương (nếu có)",
  "experienceRequired": "số năm kinh nghiệm yêu cầu",
  "mustHave": ["yêu cầu bắt buộc 1"],
  "niceToHave": ["yêu cầu nên có 1"],
  "responsibilities": ["trách nhiệm chính 1"],
  "benefits": ["quyền lợi 1"]
}`;

  const result = await withRetry(() => chatJson([{ role: 'user', content: prompt }], { maxTokens: 3000, temperature: 0.2 }));
  if (!result || !Array.isArray(result.mustHave)) throw new Error('AI phân tích JD không hợp lệ');
  return result;
}

// ---------- Bước 4: phân tích sâu (temperature 0.15 — giảm variance điểm) ----------
async function analyzeCV(cvText, meta, jdStructured) {
  const jdSection = jdStructured
    ? `

=== TIN TUYỂN DỤNG MỤC TIÊU ===
Vị trí: ${jdStructured.title}
Công ty: ${jdStructured.company || '—'}
Địa điểm: ${jdStructured.location || '—'}
Lương: ${jdStructured.salary || '—'}
Kinh nghiệm yêu cầu: ${jdStructured.experienceRequired || '—'}
Yêu cầu bắt buộc: ${JSON.stringify(jdStructured.mustHave)}
Yêu cầu nên có: ${JSON.stringify(jdStructured.niceToHave || [])}
Trách nhiệm: ${JSON.stringify((jdStructured.responsibilities || []).slice(0, 8))}`
    : '';

  const prompt = `Bạn là chuyên gia tuyển dụng IT/nhân sự dày dặn kinh nghiệm tại Việt Nam, am hiểu sâu cả thị trường Việt Nam và quốc tế. Hãy phân tích CV dưới đây như một nhà tuyển dụng thật, thẳng thắn nhưng mang tính xây dựng.${jdSection}

=== CV ỨNG VIÊN: ${meta.candidateName || ''} (${meta.targetRole || 'chưa rõ'} | ${meta.experienceLevel || 'chưa rõ'}) ===
${String(cvText || '').slice(0, MAX_CV_CHARS)}

${jdStructured
    ? `NHIỆM VỤ (bắt buộc có phần đối chiếu JD):
1. Chấm điểm CV tổng thể (0-100) theo 4 tiêu chí: content (nội dung, thành tích định lượng), format (trình bày, cấu trúc), relevance (liên quan vị trí mục tiêu), impact (điểm nhấn, con số).
2. Điểm mạnh / điểm yếu cụ thể — TRÍCH DẪN thẳng từ CV, không nói chung chung.
3. Đối chiếu CV với tin tuyển dụng: từng yêu cầu của JD đáp ứng hay không, TRÍCH BẰNG CHỨNG cụ thể từ CV. Chấm điểm khớp ATS (0-100).
4. Skill gap: kỹ năng còn thiếu so với JD + lộ trình học cụ thể (tên khóa/công nghệ, thời gian ước lượng, thứ tự ưu tiên).
5. Red flags ATS: những gì khiến CV bị loại bởi hệ thống lọc CV.
6. 3 câu hỏi phỏng vấn khó nhất ứng viên có thể gặp với JD này dựa trên CV hiện tại.`
    : `NHIỆM VỤ:
1. Chấm điểm CV tổng thể (0-100) theo 4 tiêu chí: content (nội dung, thành tích định lượng), format (trình bày, cấu trúc), relevance (liên quan vị trí mục tiêu "${meta.targetRole}"), impact (điểm nhấn, con số).
2. Điểm mạnh / điểm yếu cụ thể — TRÍCH DẪN thẳng từ CV, không nói chung chung.
3. Gợi ý cải thiện cụ thể (làm gì, sửa gì, thêm gì).
4. Red flags ATS: những gì khiến CV bị hệ thống lọc CV loại.
5. 3 câu hỏi phỏng vấn khó nhất ứng viên có thể gặp dựa trên CV này.`}

QUY TẮC alternativePaths: nếu điểm thấp (overallScore dưới 45) hoặc khả năng đậu dưới 25%, hoặc CV rõ ràng lệch hướng so với vị trí mục tiêu — hãy đề xuất 2-3 vị trí/công việc KHÁC mà CV này thực sự có lợi thế hơn, dựa trên bằng chứng trong CV và thực tế thị trường Việt Nam. Nếu hồ sơ vẫn hợp lý với vị trí mục tiêu thì để null.

QUY TẮC ĐỘ DÀI (bắt buộc — phản hồi phải gọn): mỗi chuỗi tối đa ~25 từ, không diễn giải dài dòng; strengths tối đa 4, weaknesses tối đa 4, improvements tối đa 3, atsRedFlags tối đa 4, match.matched tối đa 5, match.missing tối đa 5, roadmap tối đa 5 bước, alternativePaths tối đa 3.

Trả về CHỈ một JSON object:
{
  "overallScore": number,
  "breakdown": { "content": number, "format": number, "relevance": number, "impact": number },
  "hireAssessment": {
    "passProbability": number,
    "verdict": "very_likely|likely|uncertain|unlikely|very_unlikely",
    "verdictLabel": "nhãn ngắn 2-5 từ TIẾNG VIỆT do bạn tự đặt mô tả đúng mức đánh giá này (VD: 'Nghiêng về trượt', 'Ranh giới mong manh', 'Cơ hội khá sáng') — KHÔNG chứa con số phần trăm, KHÔNG lặp lại %",
    "headline": "câu kết luận ngắn gọn, trực diện",
    "reasons": ["lý do chính khiến tỉ lệ này (tích cực hoặc tiêu cực)"],
    "whatWouldRaise": ["hành động cụ thể giúp tăng tỉ lệ này lên đáng kể"]
  },
  "summary": "tóm tắt 2-3 câu về ứng viên, tiếng Việt",
  "strengths": [{ "point": "...", "evidence": "trích dẫn từ CV" }],
  "weaknesses": [{ "point": "...", "evidence": "...", "fix": "cách sửa cụ thể" }],
  "improvements": [{ "title": "...", "detail": "...", "priority": "high|medium|low", "impact": "why it matters" }],
  "atsRedFlags": ["..."],
  "hardQuestions": ["..."],
  "match": {
    "matchScore": number,
    "verdict": "excellent|good|moderate|weak",
    "verdictLabel": "nhãn ngắn 2-4 từ TIẾNG VIỆT mô tả mức khớp này (VD: 'Khá ổn', 'Lệch hướng rõ') — không chứa con số",
    "matched": [{ "requirement": "...", "evidence": "..." }],
    "missing": [{ "requirement": "...", "severity": "critical|important|nice", "note": "..." }],
    "extraPoints": ["điểm cộng ứng viên có nhưng JD không yêu cầu"]
  },
  "roadmap": [
    { "step": 1, "skill": "...", "why": "tại sao cần", "how": "học ở đâu / làm gì cụ thể", "duration": "vd: 2 tuần", "priority": "high|medium|low" }
  ],
  "alternativePaths": [
    {
      "role": "tên vị trí phù hợp hơn",
      "fitScore": number,
      "why": "vì sao CV này có lợi thế ở vị trí đó — trích dẫn bằng chứng từ CV",
      "note": "điều cần chuẩn bị thêm nếu chuyển hướng sang vị trí này"
    }
  ]
}
(match và roadmap: null nếu không có JD; alternativePaths: null nếu hồ sơ vẫn hợp lý với vị trí mục tiêu)`;

  const result = await withRetry(() => chatJson([{ role: 'user', content: prompt }], { maxTokens: 8000, temperature: 0.15 }));
  if (typeof result.overallScore !== 'number') throw new Error('AI phân tích CV không hợp lệ');

  // Cap số mục theo QUY TẮC ĐỘ DÀI — AI hay bỏ qua, chặt ở server cho chắc
  const cap = (arr, n) => Array.isArray(arr) ? arr.slice(0, n) : arr;
  result.strengths = cap(result.strengths, 4);
  result.weaknesses = cap(result.weaknesses, 4);
  result.improvements = cap(result.improvements, 3);
  result.atsRedFlags = cap(result.atsRedFlags, 4);
  result.hardQuestions = cap(result.hardQuestions, 3);
  result.alternativePaths = result.alternativePaths ? result.alternativePaths.slice(0, 3) : null;
  result.roadmap = result.roadmap ? result.roadmap.slice(0, 5) : null;
  if (result.match) {
    result.match.matched = cap(result.match.matched, 5);
    result.match.missing = cap(result.match.missing, 5);
    result.match.verdictLabel = String(result.match.verdictLabel || '').trim().slice(0, 30) || undefined;
  }
  // Không có JD → match/roadmap phải null: AI hay tự sinh dù prompt cấm null,
  // để lọt qua thì dashboard hiện tab Lộ trình/Đối chiếu giả không có căn cứ
  if (!jdStructured) {
    result.match = null;
    result.roadmap = null;
  }
  if (result.hireAssessment) {
    result.hireAssessment.verdictLabel = String(result.hireAssessment.verdictLabel || '').trim().slice(0, 40) || undefined;
  }
  // Fallback hireAssessment khi AI thiếu field — dashboard không được chết vì thiếu dữ liệu
  if (!result.hireAssessment || typeof result.hireAssessment.passProbability !== 'number') {
    const score = result.overallScore || 0;
    result.hireAssessment = {
      passProbability: Math.max(2, Math.min(95, Math.round(score * 0.9))),
      verdict: score >= 75 ? 'likely' : score >= 50 ? 'uncertain' : score >= 30 ? 'unlikely' : 'very_unlikely',
      headline: '',
      reasons: [],
      whatWouldRaise: [],
    };
  }
  return result;
}

// ---------- Pipeline nền: chạy SAU upload (setImmediate) — user đóng tab vẫn chạy ----------
async function processSession(id) {
  try {
    const session = readSession(id);
    if (session.status === 'ready') return;

    // Vị trí nhắm tới là bắt buộc — KHÔNG BAO GIỜ đốt token chấm CV mù
    if (!(session.meta?.targetRole || '').trim()) {
      await patchSession(id, {
        status: 'error',
        error: 'Thiếu vị trí nhắm tới. HireMind đối chiếu CV với một đích cụ thể — tạo phiên mới và điền "Vị trí nhắm tới" (VD: Data Analyst).',
        missingRole: true,
      });
      return;
    }

    // Bước 1: trích xuất
    await patchSession(id, { stage: 'extracting', stageLabel: 'Đang đọc và trích xuất nội dung CV...' });
    const { parts, warnings } = await extractContent(session);
    if (!parts.length) {
      await patchSession(id, {
        status: 'error',
        error: 'Không trích xuất được nội dung nào từ các file. Hãy kiểm tra lại file (CV dạng scan cần ảnh rõ chữ).',
        warnings,
      });
      return;
    }

    // Bước 2: AI validate + gộp CV — nhanh not-CV KHÔNG tốn tiếp token analyze
    await patchSession(id, { stage: 'validating', stageLabel: 'AI đang đọc hiểu CV của bạn...', warnings });
    const cv = await validateAndStructure(parts);
    if (!cv.isCv) {
      await patchSession(id, { status: 'error', error: cv.reason || 'Tài liệu tải lên có vẻ không phải là CV.', notCv: true });
      return;
    }

    // Bước 3: JD — link chết KHÔNG chết phiên (fallback dán tay / chạy không JD)
    let jdStructured = null;
    let jdNotice = null;
    let jdSource = null;
    if (session.meta.jdUrl || session.meta.jdManual) {
      await patchSession(id, { stage: 'jd', stageLabel: 'Đang tải và phân tích tin tuyển dụng...' });
      let jdText = null;
      if (session.meta.jdUrl) {
        try {
          const { text, via } = await withRetry(() => fetchJD(session.meta.jdUrl), { tries: 1 });
          jdText = text;
          jdSource = via;
        } catch (e) {
          if (session.meta.jdManual) {
            jdText = session.meta.jdManual;
            jdSource = 'manual';
            jdNotice = 'Không tải được tự động từ link JD, đã dùng nội dung bạn dán thủ công.';
          } else {
            jdNotice = 'Không tải được nội dung từ link JD. Phân tích tiếp theo CV (không có phần đối chiếu JD). Bạn có thể tạo phiên mới và dán JD thủ công.';
          }
        }
      } else {
        jdText = session.meta.jdManual;
        jdSource = 'manual';
      }
      if (jdText) jdStructured = await structureJD(jdText, session.meta.jdUrl);
    }

    // Bước 4: phân tích sâu + đối chiếu
    await patchSession(id, { stage: 'analyzing', stageLabel: 'AI đang phân tích sâu và đối chiếu...' });
    const analysis = await analyzeCV(cv.cleanedCv || '', session.meta, jdStructured);

    await patchSession(id, {
      status: 'ready',
      stage: 'done',
      stageLabel: 'Hoàn tất',
      cv,
      jd: jdStructured,
      jdSource,
      jdNotice,
      result: analysis,
      readyAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error(`[pipeline:${id}]`, e);
    try {
      await patchSession(id, { status: 'error', error: e.friendly || `Xử lý thất bại: ${e.message.slice(0, 200)}` });
    } catch (_) { /* session dir biến mất — bỏ qua */ }
  }
}

module.exports = { sessionDir, readSession, writeSession, withSession, patchSession, withRetry, extractContent, validateAndStructure, structureJD, analyzeCV, processSession, DATA_DIR, SESSION_RE };
