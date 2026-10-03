// server.js — HireMind (KHUNG TRẮNG ngày thi). Chỉ có phần khung khởi động.
// Mọi logic nghiệp vụ phải được viết và commit trong 12 giờ thi — kế hoạch: docs/EXAM-PLAN.md
require('./dotenv').loadEnv(__dirname);
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
app.disable('x-powered-by');

app.use(express.json({ limit: '60mb' })); // limit lớn để chứa ảnh base64 của PDF scan

// Security headers ("helmet-lite") — đặt TRƯỚC static để mọi response đều mang
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    // CSP gọn: app chỉ gọi chính nó; ảnh data:/blob: cho preview CV + ảnh scan
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; " +
      "script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
  });
  next();
});
// TODO(ngày thi): express.static('public') + route GET /s/:id trả public/session.html
// TODO(ngày thi): multer diskStorage vào data/<id>/uploads + middleware kiểm tra
//                 X-Session-Id khớp regex id (chặn path traversal TRƯỚC khi multer ghi file)
// TODO(ngày thi): rate limit per-IP (token bucket tự viết) cho các endpoint tốn AI

// Static: no-cache mọi thứ — LiteSpeed/host hay gắn cache max-age 7 ngày cho HTML,
// ETag vẫn đảm bảo file sửa là mới ngay (không cần bump ?v=)
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders(res) { res.set('Cache-Control', 'no-cache'); },
}));

// /s/:id — trang phiên (SPA-style). Id KHÔNG validate ở đây (validate ở API).
app.get('/s/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'session.html'));
});

// Session id: 12 hex từ UUID — regex chặt dùng chung khắp nơi (chặn path traversal)
const SESSION_RE = /^[a-f0-9]{12}$/;
const newSessionId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);

// Middleware kiểm tra X-Session-Id TRƯỚC khi multer ghi file xuống đĩa
function requireSessionId(req, res, next) {
  const id = req.get('x-session-id') || '';
  if (!SESSION_RE.test(id)) {
    return res.status(400).json({ error: 'Phiên không hợp lệ — hãy mở lại link phiên.' });
  }
  req.sessionId = id;
  next();
}

// Rate limit per-IP, token bucket tự viết — bảo vệ các endpoint tốn AI
const buckets = new Map(); // key "<name>:<ip>" -> { tokens, last }
function rateLimit(name, { capacity = 10, refillMs = 6000 } = {}) {
  return (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    const b = buckets.get(key) || { tokens: capacity, last: now };
    b.tokens = Math.min(capacity, b.tokens + (now - b.last) / refillMs);
    b.last = now;
    if (b.tokens < 1) {
      return res.status(429).json({ error: 'Bạn thao tác quá nhanh — chờ một chút rồi thử lại.' });
    }
    b.tokens -= 1;
    buckets.set(key, b);
    next();
  };
}

// data/<id>/ — mỗi phiên một thư mục: session.json + uploads/
const DATA_DIR = path.join(__dirname, 'data');

// POST /api/session/new — tạo phiên, trả link /s/:id
app.post('/api/session/new', (req, res) => {
  try {
    const id = newSessionId();
    fs.mkdirSync(path.join(DATA_DIR, id), { recursive: true });
    fs.writeFileSync(path.join(DATA_DIR, id, 'session.json'), JSON.stringify({
      id, status: 'uploading', createdAt: new Date().toISOString(), files: [], meta: {},
    }, null, 2));
    res.json({ id, url: `/s/${id}` });
  } catch (e) {
    console.error('[session/new]', e);
    res.status(500).json({ error: 'Không tạo được phiên — thử lại.' });
  }
});

// Multer: ghi vào data/<sessionId>/uploads (session id đã qua regex ở middleware)
const multer = require('multer');
const upload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(DATA_DIR, req.sessionId, 'uploads');
      try {
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      } catch (e) { cb(e); }
    },
    filename(req, file, cb) {
      // sanitize: chỉ giữ chữ/số/dấu gạch/chấm/cách — tránh ký tự nguy hiểm trên đĩa
      const safe = file.originalname.replace(/[^\w.\- ]+/g, '_').slice(-80);
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  limits: { files: 12, fileSize: 15 * 1024 * 1024 },
});

// Bắt lỗi multer (quá 15MB / quá 12 file...) → thông báo thân thiện thay vì HTML lỗi mặc định
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File vượt quá 15MB.'
      : err.code === 'LIMIT_FILE_COUNT' ? 'Tối đa 12 file mỗi lần gửi.'
      : 'Gửi file không thành công: ' + err.code;
    return res.status(413).json({ error: msg });
  }
  next(err);
});

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
