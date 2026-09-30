// lib/pipeline.js — TODO(ngày thi): pipeline xử lý NỀN sau upload (user có thể thoát trang).
// Các bước dự kiến: trích xuất nội dung file (OCR ảnh/DOCX/TXT/PDF text) →
// AI xác thực + gộp CV → fetch + cấu trúc JD → AI phân tích sâu (JSON schema).
// Yêu cầu:
// - Ghi stage + stageLabel vào data/<id>/session.json sau mỗi bước để UI poll hiển thị tiến độ.
// - readSession/writeSession/patchSession; session id phải khớp regex (chặn path traversal).
// - File lỗi/cảnh báo không được làm chết cả phiên (gom warnings).
// - Sai đầu vào (không phải CV / thiếu vị trí nhắm tới) → session error + flag riêng cho UI.
module.exports = {};
