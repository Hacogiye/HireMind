// lib/services.js — TODO(ngày thi): các tính năng hội thoại dựa trên ngữ cảnh CV+JD.
// - cvContext(session): gom CV sạch + JD + kết quả phân tích — dùng chung mọi prompt.
// - rewriteCV(session, {mode}): VIẾT LẠI CV — 2 CHẾ ĐỘ (điểm nhấn giám khảo):
//     • reshape (mặc định): cấu trúc lại, diễn lại, CẮT GỌN chi tiết thừa/sáo rỗng —
//       KHÔNG thêm gì mới (tuyệt đối không bịa). Bullet theo X-Y-Z (đạt X, đo Y, cách Z)
//       CHỈ dùng số liệu có thật trong CV.
//     • addskills: thêm mục "## KỸ NĂNG ĐANG BỔ SUNG" cuối CV từ các gap, mỗi kỹ năng
//       ghi chú trung thực (đang học / cần rèn) — CẤM nhúng vào kinh nghiệm như đã làm;
//       change type "add" riêng. Kết quả luôn kèm cảnh báo "ý kiến AI chỉ tham khảo".
//   Hậu xử lý: phục hồi email/SĐT thật từ cleanedCv (AI có thói quen che PII thành
//   placeholder "[Điền email...]" dù prompt cấm).
// - generateCoverLetter: chuẩn chuyên nghiệp — LETTERHEAD 1 dòng (tên • SĐT • email •
//   địa chỉ), chào cá nhân hóa theo công ty, 250–350 từ, TỐI ĐA 3 con số, 2–3 bullet
//   X-Y-Z tự nhiên, 1 câu "vì sao chọn công ty", nguyên tắc bán giải pháp, CTA tự tin,
//   KHÔNG lặp tiêu đề email trong thân thư.
// - interviewSystem + parser lượt phỏng vấn (nếu làm Mock Interview): marker mood,
//   kết thúc + JSON report; maxTokens ≥4000 (report bị cắt nếu nhỏ) + retry lấy report.
module.exports = {};
