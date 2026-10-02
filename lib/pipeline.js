// lib/pipeline.js — TODO(ngày thi): pipeline xử lý NỀN sau upload (user thoát trang vẫn chạy).
// Bước: trích xuất (OCR ảnh / DOCX / TXT / PDF text) → AI validate + gộp CV →
// fetch + cấu trúc JD → AI phân tích sâu (JSON schema).
// Yêu cầu bắt buộc:
// - HÀNG ĐỘI GHI THEO PHIÊN (withSession): mọi ghi session.json đi qua hàng đợi của phiên —
//   pipeline/chat/rewrite ghi chồng nhau mà read-modify-write trực tiếp sẽ MẤT dữ liệu.
// - patchSession đi qua hàng đợi; session id khớp regex chặt (chặn path traversal).
// - Ghi stage + stageLabel vào session.json sau mỗi bước để UI poll hiển thị tiến độ thật.
// - Schema phân tích: overallScore, breakdown(4), hireAssessment (passProbability +
//   verdictLabel do AI TỰ VIẾT, headline, reasons, whatWouldRaise), match (matchScore +
//   verdictLabel, matched/missing có bằng chứng + severity), roadmap ≤5, alternativePaths ≤3
//   (điểm thấp/lệch hướng), atsRedFlags, hardQuestions. Cap số mục ở server (AI hay bỏ qua).
// - temperature 0.15 cho bước analyze — giảm variance điểm giữa các lần chấm cùng CV.
// - Sai đầu vào (not-CV / thiếu vị trí nhắm tới) → session error + flag riêng, không tốn token.
module.exports = {};
