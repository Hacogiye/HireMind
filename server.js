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
    // CSP gọn: app chỉ gọi chính nó; ảnh data:/blob: cho preview CV + ảnh scan;
    // Google Fonts cho typography (style + font-src)
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src https://fonts.gstatic.com; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'",
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
// Pipeline nền + hàng đợi ghi — mọi ghi session.json đi qua withSession
const { withSession, processSession, patchSession, readSession } = require('./lib/pipeline');
const { rewriteCV, generateCoverLetter } = require('./lib/services');

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
  limits: { files: 12, fileSize: 15 * 1024 * 1024, fieldSize: 20 * 1024 * 1024 },
  // fieldSize: busboy mặc định chặn 1MB/form field — clientPdfImages (JSON base64
  // các trang scan) dễ vượt và chết 500 im lặng nếu không nâng.
});

// POST /api/upload — nhận file + meta, chuyển phiên sang processing, kick off pipeline nền
app.post('/api/upload', rateLimit('upload'), requireSessionId, upload.array('files', 12), (req, res) => {
  try {
    const sessionFile = path.join(DATA_DIR, req.sessionId, 'session.json');
    if (!fs.existsSync(sessionFile)) {
      return res.status(404).json({ error: 'Phiên không tồn tại — hãy tạo phiên mới.' });
    }

    const meta = safeParse(req.body.meta);
    if (!meta.targetRole || !String(meta.targetRole).trim()) {
      return res.status(400).json({ error: 'Chưa nhập "Vị trí nhắm tới" — cần biết vị trí để phân tích CV.' });
    }
    // Chặn sớm: không có file nào và không có text nào → pipeline chỉ có thể chết
    if (!(req.files || []).length && !req.body.clientPdfText) {
      return res.status(400).json({ error: 'Chưa có CV nào — hãy chọn file hoặc dán nội dung CV.' });
    }

    // Ghi QUA HÀNG ĐỘI của phiên — pipeline nền vừa được kick off cũng ghi session này
    withSession(req.sessionId, (session) => {
      for (const f of (req.files || [])) {
        session.files.push({
          stored: f.filename,
          // multer decode sai tên file UTF-8 (tiếng Việt) — sửa lại từ latin1
          name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
          size: f.size,
          type: f.mimetype,
        });
      }
      session.meta = {
        targetRole: String(meta.targetRole).trim(),
        experienceLevel: meta.experienceLevel || '',
        jdUrl: meta.jdUrl || '',
        jdManual: meta.jdManual || '',
      };
      // Dữ liệu client gửi kèm (pdf.js chạy trên browser) — extractContent sẽ xóa sau khi dùng
      if (typeof req.body.clientPdfText === 'string') session.clientPdfText = req.body.clientPdfText;
      if (typeof req.body.clientPdfImages === 'string') {
        const imgs = safeParse(req.body.clientPdfImages);
        if (Array.isArray(imgs)) session.clientPdfImages = imgs;
      }
      session.status = 'processing';
      session.stage = 'queued';
      session.stageLabel = 'Trong hàng đợi';
    }).then(() => {
      // Pipeline nền fire-and-forget — user đóng tab vẫn chạy tiếp
      setImmediate(() => processSession(req.sessionId).catch(e => console.error('[pipeline-kick]', e)));
    }).catch(e => {
      console.error('[upload-write]', e);
    });

    res.json({ id: req.sessionId, url: `/s/${req.sessionId}` });
  } catch (e) {
    console.error('[upload]', e);
    res.status(500).json({ error: 'Xử lý file gặp lỗi — thử lại.' });
  }
});

function safeParse(s) {
  if (!s || typeof s !== 'string') return {};
  try { return JSON.parse(s); } catch { return {}; }
}

// GET /api/session/:id — poll trạng thái + dữ liệu phân tích (dashboard sẽ dùng)
app.get('/api/session/:id', (req, res) => {
  const id = req.params.id;
  if (!SESSION_RE.test(id)) return res.status(400).json({ error: 'Phiên không hợp lệ.' });
  const sessionFile = path.join(DATA_DIR, id, 'session.json');
  if (!fs.existsSync(sessionFile)) return res.status(404).json({ error: 'Không tìm thấy phiên.' });
  try {
    const s = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
    // Không trả payload lớn (base64 ảnh scan) qua poll — dashboard không cần
    const { clientPdfText, clientPdfImages, ...pub } = s;
    res.json(pub);
  } catch (e) {
    console.error('[session:get]', e);
    res.status(500).json({ error: 'Đọc phiên gặp lỗi.' });
  }
});

// Bắt lỗi multer (quá 15MB / quá 12 file...) → thông báo thân thiện.
// ĐẶT SAU các route — error handler chỉ bắt lỗi của route đăng ký TRƯỚC nó.
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'File vượt quá 15MB.'
      : err.code === 'LIMIT_FILE_COUNT' ? 'Tối đa 12 file mỗi lần gửi.'
      : 'Gửi file không thành công: ' + err.code;
    return res.status(413).json({ error: msg });
  }
  next(err);
});

// ---------- Viết lại CV 2 chế độ + xuất Word ----------
// rewrite lưu khi xong, rewritePending=true khi đang tạo — user rời tab quay lại vẫn thấy.
// POST luôn tạo MỚI (UI chỉ gọi khi user bấm nút; restore sau reload đọc thẳng session.rewrite).
app.post('/api/session/:id/rewrite', rateLimit('rewrite', { capacity: 20, refillMs: 3000 }), async (req, res) => {
  try {
    const s = readSession(req.params.id);
    if (s.status !== 'ready') return res.status(400).json({ error: 'Phiên chưa sẵn sàng' });
    const mode = req.body?.mode === 'addskills' ? 'addskills' : 'reshape';

    await withSession(req.params.id, s2 => {
      s2.rewritePending = true;
      s2.rewriteMeta = mode;
    });

    try {
      const result = await rewriteCV(s, { mode });
      if (!result || typeof result.rewrittenCv !== 'string' || !result.rewrittenCv.trim()) {
        throw new Error('AI trả về CV viết lại không hợp lệ');
      }
      result.changes = Array.isArray(result.changes) ? result.changes.slice(0, mode === 'addskills' ? 10 : 8) : [];
      result.unfixableGaps = Array.isArray(result.unfixableGaps) ? result.unfixableGaps.slice(0, 4) : [];
      await withSession(req.params.id, s2 => {
        s2.rewrite = result;
        s2.rewriteMode = mode;
        s2.rewritePending = false;
      });
      res.json({ ...result, mode });
    } catch (e) {
      await withSession(req.params.id, s2 => { s2.rewritePending = false; }).catch(() => {});
      throw e;
    }
  } catch (e) {
    console.error('[rewrite]', e);
    if (e.status) return res.status(e.status).json({ error: e.message });
    res.status(500).json({ error: e.friendly || 'Không viết lại được CV. Thử lại sau ít phút.' });
  }
});

app.post('/api/export/docx', (req, res) => {
  try {
    const { title, markdown } = req.body || {};
    if (!markdown) return res.status(400).json({ error: 'Thiếu nội dung' });
    const { buildDocx } = require('./lib/docx'); // lazy — không đụng khi boot
    const buf = buildDocx(String(title || 'HireMind'), String(markdown).slice(0, 60000));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="hiremind-export.docx"');
    res.send(buf);
  } catch (e) {
    console.error('[docx]', e);
    res.status(500).json({ error: 'Không tạo được file Word' });
  }
});

// Export CV thiết kế: banner màu + ô dán ảnh 3×4 + heading màu + ngày căn phải + skill 2 cột
app.post('/api/export/cv-docx', (req, res) => {
  try {
    const { markdown, name } = req.body || {};
    if (!markdown) return res.status(400).json({ error: 'Thiếu nội dung CV' });
    const { buildCvDocx } = require('./lib/docx');
    const buf = buildCvDocx(String(markdown).slice(0, 60000), { name: String(name || 'CV') });
    const safeName = String(name || 'CV').replace(/[^\p{L}\w\- ]+/gu, '').trim().replace(/\s+/g, '-') || 'HireMind';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="CV-${encodeURIComponent(safeName)}.docx"; filename*=UTF-8''CV-${encodeURIComponent(safeName + '.docx')}`);
    res.send(buf);
  } catch (e) {
    console.error('[cv-docx]', e);
    res.status(500).json({ error: 'Không tạo được file CV Word' });
  }
});

// ---------- Vòng kiểm chứng: nạp CV mới vào PHIÊN CON so với phiên gốc ----------
// Phiên con kế thừa meta (vị trí/JD) + mang parentSessionId — dashboard phiên con
// dùng nó để tải kết quả phiên gốc dựng panel so sánh trước/sau.
app.post('/api/session/:id/reupload', requireSessionId, upload.array('files', 12), (req, res) => {
  try {
    const parentId = req.params.id;
    if (!SESSION_RE.test(parentId)) return res.status(400).json({ error: 'Session id không hợp lệ' });
    const parentFile = path.join(DATA_DIR, parentId, 'session.json');
    if (!fs.existsSync(parentFile)) return res.status(404).json({ error: 'Không tìm thấy phiên gốc' });
    const parent = JSON.parse(fs.readFileSync(parentFile, 'utf8'));
    if (parent.status !== 'ready') return res.status(400).json({ error: 'Phiên gốc chưa sẵn sàng' });
    if (!(req.files || []).length && !req.body.clientPdfText) {
      return res.status(400).json({ error: 'Chưa chọn file CV nào' });
    }

    const id = newSessionId();
    fs.mkdirSync(path.join(DATA_DIR, id), { recursive: true });
    // Ghi khởi tạo qua hàng đợi luôn — pipeline vừa kick off cũng ghi phiên này
    withSession(id, (session) => {
      session.id = id;
      session.status = 'uploading';
      session.createdAt = new Date().toISOString();
      session.files = (req.files || []).map(f => ({
        stored: f.filename,
        name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
        size: f.size,
        type: f.mimetype,
      }));
      session.meta = { ...(parent.meta || {}), ...(safeParse(req.body.meta) || {}) };
      session.parentSessionId = parentId;
      if (typeof req.body.clientPdfText === 'string') session.clientPdfText = req.body.clientPdfText;
      if (typeof req.body.clientPdfImages === 'string') {
        const imgs = safeParse(req.body.clientPdfImages);
        if (Array.isArray(imgs)) session.clientPdfImages = imgs;
      }
      session.status = 'processing';
      session.stage = 'queued';
      session.stageLabel = 'Đang chờ xử lý...';
    }).then(() => {
      setImmediate(() => processSession(id).catch(e => console.error('[reupload-pipeline]', e)));
    }).catch(e => console.error('[reupload-write]', e));

    res.json({ id, url: `/s/${id}` });
  } catch (e) {
    console.error('[reupload]', e);
    res.status(500).json({ error: 'Không tạo được phiên kiểm chứng — thử lại.' });
  }
});

// ---------- Cover Letter: pending + cache theo option ----------
// Cùng tone/language/extraNote → trả kết quả đã có, không đốt AI call.
app.post('/api/session/:id/cover-letter', rateLimit('cover', { capacity: 30, refillMs: 3000 }), async (req, res) => {
  try {
    const s = readSession(req.params.id);
    if (s.status !== 'ready') return res.status(400).json({ error: 'Phiên chưa sẵn sàng' });
    const { tone, language, extraNote } = req.body || {};

    const optsKey = JSON.stringify({ tone: tone || 'professional', language: language || 'vi', extraNote: extraNote || null });
    if (s.coverLetter && s.coverLetterMeta === optsKey) {
      return res.json({ ...s.coverLetter, cached: true });
    }

    await withSession(req.params.id, s2 => {
      s2.coverLetterPending = true;
      s2.coverLetterMeta = optsKey;
    });

    try {
      const result = await generateCoverLetter(s, { tone, language, extraNote });
      await withSession(req.params.id, s2 => {
        s2.coverLetter = result;
        s2.coverLetterPending = false;
      });
      res.json(result);
    } catch (e) {
      await withSession(req.params.id, s2 => { s2.coverLetterPending = false; }).catch(() => {});
      throw e;
    }
  } catch (e) {
    console.error('[cover-letter]', e);
    res.status(500).json({ error: e.friendly || 'Không tạo được cover letter. Thử lại.' });
  }
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
  // Startup sweep: session "processing" sót từ lần chạy cũ là chết (pipeline đã
  // chết cùng process cũ) — đánh dấu error để user không thấy spinner vĩnh viễn.
  // Clear MỌI pending flag — pending sót trên phiên ready cũng làm UI kẹt vĩnh viễn.
  try {
    for (const id of fs.readdirSync(DATA_DIR)) {
      if (!SESSION_RE.test(id)) continue;
      const f = path.join(DATA_DIR, id, 'session.json');
      if (!fs.existsSync(f)) continue;
      try {
        const s = JSON.parse(fs.readFileSync(f, 'utf8'));
        if (s.status === 'processing') {
          patchSession(id, {
            status: 'error',
            error: 'Máy chủ đã khởi động lại giữa lúc xử lý — hãy tạo phiên mới và nạp lại CV.',
            chatPending: false,
            interviewPending: false,
            coverLetterPending: false,
            rewritePending: false,
          });
        }
      } catch { /* session hỏng — bỏ qua, không chết boot */ }
    }
  } catch (e) {
    console.warn('[startup] sweep failed:', e.message);
  }
});
