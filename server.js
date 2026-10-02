// server.js — HireMind (KHUNG TRẮNG ngày thi). Chỉ có phần khung khởi động.
// Mọi logic nghiệp vụ phải được viết và commit trong 12 giờ thi — kế hoạch: docs/EXAM-PLAN.md
require('./dotenv').loadEnv(__dirname);
const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
app.disable('x-powered-by');

app.use(express.json({ limit: '60mb' })); // limit lớn để chứa ảnh base64 của PDF scan

// TODO(ngày thi): security headers (CSP, X-Frame-Options, nosniff...) đặt TRƯỚC express.static
// TODO(ngày thi): express.static('public') + route GET /s/:id trả public/session.html
// TODO(ngày thi): multer diskStorage vào data/<id>/uploads + middleware kiểm tra
//                 X-Session-Id khớp regex id (chặn path traversal TRƯỚC khi multer ghi file)
// TODO(ngày thi): rate limit per-IP (token bucket tự viết) cho các endpoint tốn AI

// Health check — dùng verify deploy nhanh (phần khung, không phải logic nghiệp vụ)
app.get('/api/health', (req, res) => res.json({ ok: true, name: 'hiremind', ts: Date.now() }));

// TODO(ngày thi) — API routes cần dựng:
//   POST /api/session/new               tạo phiên, trả link /s/:id
//   POST /api/upload                    lưu file + meta (clientPdfText/Images), kick off
//                                       pipeline nền (setImmediate) — user thoát trang vẫn chạy
//   GET  /api/session/:id               poll trạng thái / kết quả
//   POST /api/session/:id/rewrite       Viết lại CV — body {mode: reshape|addskills};
//                                       pending state + rewriteMode persist; POST luôn tạo mới
//   POST /api/session/:id/reupload      PHIÊN CON kế thừa meta + parentSessionId (vòng kiểm chứng)
//   POST /api/session/:id/chat          Chat Coach (lịch sử persist vào session.json)
//   POST /api/session/:id/interview/*   Mock interview (start/reply/stop/state/history)
//   POST /api/session/:id/cover-letter  Cover letter (pending + cache theo option)
//   POST /api/export/docx               xuất Word từ Markdown
//   POST /api/export/cv-docx            xuất CV THIẾT KẾ (banner màu, ô dán ảnh 3×4)
//   GET  /api/health                    health check
//
// Ghi session.json: ĐỌC-LẠI-TRƯỚC-KHI-GHI hoặc hàng đợi theo phiên — các luồng
// (pipeline + chat + rewrite + cover letter) ghi chồng nhau sẽ mất dữ liệu nếu không.

// Passenger/cPanel (Setup Node.js App) cấp PORT qua env; local mặc định 3000.
app.listen(PORT, () => {
  console.log(`HireMind running at http://localhost:${PORT}`);
  // TODO(ngày thi): startup sweep — session "processing" sót từ lần chạy cũ là chết,
  // đánh dấu thành error để user không thấy spinner vĩnh viễn.
});
