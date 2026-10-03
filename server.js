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
const { rewriteCV, generateCoverLetter, chatTurn, interviewSystem, parseInterviewTurn } = require('./lib/services');

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
// Chain 3 khâu: validate parent + cấp id con (đặt req.sessionId = id CON để multer
// ghi vào đúng thư mục phiên con) → multer → ghi session.json + kick pipeline.
app.post('/api/session/:id/reupload', (req, res, next) => {
  try {
    const parentId = req.params.id;
    if (!SESSION_RE.test(parentId)) return res.status(400).json({ error: 'Session id không hợp lệ' });
    const parentFile = path.join(DATA_DIR, parentId, 'session.json');
    if (!fs.existsSync(parentFile)) return res.status(404).json({ error: 'Không tìm thấy phiên gốc' });
    const parent = JSON.parse(fs.readFileSync(parentFile, 'utf8'));
    if (parent.status !== 'ready') return res.status(400).json({ error: 'Phiên gốc chưa sẵn sàng' });

    const id = newSessionId();
    fs.mkdirSync(path.join(DATA_DIR, id), { recursive: true });
    req.sessionId = id; // multer destination đọc từ đây
    req._parent = parent;
    next();
  } catch (e) {
    console.error('[reupload]', e);
    res.status(500).json({ error: 'Không tạo được phiên kiểm chứng — thử lại.' });
  }
}, upload.array('files', 12), (req, res) => {
  try {
    const id = req.sessionId;
    const parent = req._parent;
    if (!(req.files || []).length && !req.body.clientPdfText) {
      return res.status(400).json({ error: 'Chưa chọn file CV nào' });
    }

    // Ghi khởi tạo TRỰC TIẾP: file chưa tồn tại nên withSession (đọc-trước) không dùng
    // được; an toàn vì pipeline chỉ kick SAU khi ghi xong — chưa có writer nào khác.
    const session = {
      id,
      status: 'uploading',
      createdAt: new Date().toISOString(),
      files: (req.files || []).map(f => ({
        stored: f.filename,
        name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
        size: f.size,
        type: f.mimetype,
      })),
      meta: { ...(parent.meta || {}), ...(safeParse(req.body.meta) || {}) },
      parentSessionId: parent.id,
    };
    if (typeof req.body.clientPdfText === 'string') session.clientPdfText = req.body.clientPdfText;
    if (typeof req.body.clientPdfImages === 'string') {
      const imgs = safeParse(req.body.clientPdfImages);
      if (Array.isArray(imgs)) session.clientPdfImages = imgs;
    }
    session.status = 'processing';
    session.stage = 'queued';
    session.stageLabel = 'Đang chờ xử lý...';
    fs.writeFileSync(path.join(DATA_DIR, id, 'session.json'), JSON.stringify(session, null, 2));
    setImmediate(() => processSession(id).catch(e => console.error('[reupload-pipeline]', e)));

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

// ---------- Chat Coach ----------
// Lịch sử persist trong session.json (chatHistory) — sống qua đổi tab & reload.
// Tin nhắn user được persist NGAY (chatPending=true) — rời tab giữa câu trả lời không mất.
app.post('/api/session/:id/chat', rateLimit('chat', { capacity: 60, refillMs: 3000 }), async (req, res) => {
  try {
    const s = readSession(req.params.id);
    if (s.status !== 'ready') return res.status(400).json({ error: 'Phiên chưa sẵn sàng' });
    const { message, images } = req.body;
    if (!message && !(images && images.length)) return res.status(400).json({ error: 'Thiếu tin nhắn' });
    const imgs = (Array.isArray(images) ? images : []).slice(0, 3)
      .filter(im => im && im.base64 && im.base64.length < 4 * 1024 * 1024)
      .map(im => ({ base64: String(im.base64), mime: String(im.mime || 'image/png') }));

    // Persist lượt user + pending TRƯỚC call AI chậm (qua hàng đợi ghi)
    const { history } = await withSession(req.params.id, s => {
      const hist = Array.isArray(s.chatHistory) ? s.chatHistory.slice(-12) : [];
      s.chatHistory = [...hist, { role: 'user', content: String(message || '[ảnh]') }];
      s.chatPending = true;
      return { history: hist };
    });
    const reply = await chatTurn(s, String(message || '').slice(0, 4000), history, imgs);
    await withSession(req.params.id, s2 => {
      s2.chatHistory = [...(s2.chatHistory || []), { role: 'assistant', content: reply }];
      s2.chatPending = false;
    });
    const final = readSession(req.params.id);
    res.json({ reply, history: final.chatHistory });
  } catch (e) {
    console.error('[chat]', e);
    // Clear pending để UI không treo indicators "đang gõ" khi AI chết
    try {
      await withSession(req.params.id, s => { s.chatPending = false; });
    } catch { /* ignore */ }
    res.status(500).json({ error: e.friendly || 'AI không phản hồi được. Thử lại sau ít phút.' });
  }
});

// ---------- Mock Interview ----------
// Transcript persist trong session.json (interviewMessages + interviewReport).
// Map in-memory phản chiếu trạng thái live để không đọc file mỗi lượt.
const interviews = new Map(); // id -> { messages, ended, report, mood }

function ivState(id) {
  if (!interviews.has(id)) {
    const s = readSession(id);
    interviews.set(id, { messages: s.interviewMessages || null });
  }
  return interviews.get(id);
}

app.post('/api/session/:id/interview/start', rateLimit('interview', { capacity: 90, refillMs: 3000 }), async (req, res) => {
  const s = readSession(req.params.id);
  if (s.status !== 'ready') return res.status(400).json({ error: 'Phiên chưa sẵn sàng' });
  const { prep } = req.body || {};
  const system = interviewSystem(s, { waitForReady: !!prep });
  const messages = [{ role: 'system', content: system }];
  messages.push({ role: 'user', content: prep
    ? '(Ứng viên vừa bấm nút luyện các câu hỏi khó từ báo cáo. Hãy mở đầu theo chế độ chuẩn bị: chào, giới thiệu, giải thích luồng, rồi chờ họ nói "sẵn sàng".)'
    : '(Bắt đầu buổi phỏng vấn. Hãy chào ứng viên ngắn gọn và hỏi câu hỏi đầu tiên.)' });
  interviews.set(req.params.id, { messages });
  await withSession(req.params.id, s => {
    s.interviewMessages = messages;
    s.interviewReport = null;
  });
  chatWithInterview(req.params.id, res);
});

app.post('/api/session/:id/interview/reply', rateLimit('interview', { capacity: 90, refillMs: 3000 }), async (req, res) => {
  const { message } = req.body;
  if (!interviews.has(req.params.id)) {
    // Reload giữa buổi — dựng lại từ transcript đã persist
    const st = ivState(req.params.id);
    if (!st.messages) return res.status(400).json({ error: 'Buổi phỏng vấn chưa bắt đầu' });
  }
  if (!message) return res.status(400).json({ error: 'Thiếu câu trả lời' });
  const st = interviews.get(req.params.id);
  if (st.ended) return res.status(400).json({ error: 'Buổi phỏng vấn đã kết thúc. Bấm "Luyện lại" để bắt đầu buổi mới.' });
  st.messages.push({ role: 'user', content: String(message).slice(0, 4000) });
  await withSession(req.params.id, s => { s.interviewMessages = st.messages; });
  chatWithInterview(req.params.id, res);
});

app.post('/api/session/:id/interview/stop', (req, res) => {
  let st;
  if (!interviews.has(req.params.id)) {
    st = ivState(req.params.id);
    if (!st.messages) return res.status(400).json({ error: 'Buổi phỏng vấn chưa bắt đầu' });
  } else st = interviews.get(req.params.id);
  if (st.ended) { res.json({ question: '', ended: true, report: st.report }); return; }
  st.messages.push({ role: 'user', content: '(Ứng viên muốn kết thúc buổi phỏng vấn. Hãy kết thúc và xuất báo cáo tổng kết.)' });
  chatWithInterview(req.params.id, res);
});

// Vào lại buổi đang dở sau reload
app.get('/api/session/:id/interview/state', (req, res) => {
  try {
    const s = readSession(req.params.id);
    if (s.interviewReport) return res.json({ hasSession: true, ended: true, report: s.interviewReport, mood: s.interviewMood || null });
    const st = ivState(req.params.id);
    if (!st.messages) return res.json({ hasSession: false });
    // User bấm "Kết thúc" và AI đang viết báo cáo → tín hiệu riêng để UI hiện màn "đang tổng hợp"
    const lastMsg = st.messages[st.messages.length - 1];
    if (s.interviewPending && lastMsg?.role === 'user' && /muốn kết thúc buổi phỏng vấn/.test(lastMsg.content || '')) {
      return res.json({ hasSession: true, ending: true, pending: true });
    }
    const lastAssistant = [...st.messages].reverse().find(m => m.role === 'assistant');
    if (!lastAssistant) return res.json({ hasSession: true, ended: false, question: null, pending: !!s.interviewPending });
    const { question, ended, report } = parseInterviewTurn(lastAssistant.content);
    if (ended) return res.json({ hasSession: true, ended: true, report: report || s.interviewReport, mood: s.interviewMood || null });
    return res.json({ hasSession: true, ended: false, question, pending: !!s.interviewPending, mood: s.interviewMood || null });
  } catch (e) {
    console.error('[interview-state]', e);
    res.json({ hasSession: false });
  }
});

// Transcript buổi hiện tại (mood từng lượt) — UI rebuild như chat coach
app.get('/api/session/:id/interview/transcript', (req, res) => {
  try {
    const s = readSession(req.params.id);
    const msgs = Array.isArray(s.interviewMessages) ? s.interviewMessages : [];
    const turns = [];
    for (const m of msgs) {
      if (m.role === 'system') continue;
      if (m.role === 'user') {
        const content = String(m.content).replace(/^\(.*?\)\s*/, '');
        if (content && !content.startsWith('(')) turns.push({ role: 'user', content });
      } else {
        const { question, mood } = parseInterviewTurn(m.content);
        if (question) turns.push({ role: 'interviewer', content: question, mood: mood || null });
      }
    }
    res.json({ turns });
  } catch {
    res.json({ turns: [] });
  }
});

// "Buổi mới": lưu buổi hiện tại vào interviewHistory[] rồi reset state.
app.post('/api/session/:id/interview/archive', rateLimit('interview', { capacity: 90, refillMs: 3000 }), async (req, res) => {
  try {
    const { historyCount } = await withSession(req.params.id, s => {
      s.interviewHistory = Array.isArray(s.interviewHistory) ? s.interviewHistory : [];
      if (Array.isArray(s.interviewMessages) && s.interviewMessages.length > 1) {
        const transcript = [];
        for (const m of s.interviewMessages) {
          if (m.role === 'system') continue;
          if (m.role === 'user') {
            const content = String(m.content).replace(/^\(.*?\)\s*/, '');
            if (content && !content.startsWith('(')) transcript.push({ role: 'user', content });
          } else {
            const { question, mood } = parseInterviewTurn(m.content);
            if (question) transcript.push({ role: 'interviewer', content: question, mood: mood || null });
          }
        }
        if (transcript.length) {
          s.interviewHistory.unshift({
            endedAt: new Date().toISOString(),
            report: s.interviewReport || null,
            mood: s.interviewMood || null,
            transcript,
          });
        }
      }
      s.interviewMessages = null;
      s.interviewReport = null;
      s.interviewPending = false;
      s.interviewMood = null;
      return { historyCount: s.interviewHistory.length };
    });
    interviews.delete(req.params.id);
    res.json({ ok: true, historyCount });
  } catch (e) {
    console.error('[interview-archive]', e);
    res.status(500).json({ error: 'Không lưu được buổi phỏng vấn' });
  }
});

app.get('/api/session/:id/interview/history', (req, res) => {
  try {
    const s = readSession(req.params.id);
    const history = (s.interviewHistory || []).map((h, i) => ({
      index: i,
      endedAt: h.endedAt,
      score: h.report?.overallScore ?? null,
      verdict: h.report?.verdict || null,
      turns: h.transcript?.length ?? 0,
    }));
    res.json({ history });
  } catch {
    res.json({ history: [] });
  }
});

app.get('/api/session/:id/interview/history/:index', (req, res) => {
  try {
    const s = readSession(req.params.id);
    const h = (s.interviewHistory || [])[+req.params.index];
    if (!h) return res.status(404).json({ error: 'Không tìm thấy buổi' });
    res.json(h);
  } catch {
    res.status(500).json({ error: 'Lỗi đọc lịch sử' });
  }
});

// Fire-and-forget call AI cho 1 lượt phỏng vấn: parse câu hỏi/mood/kết thúc + báo cáo.
// Báo cáo bị cắt (AI trả lời dài) → hỏi lại ĐÚNG MỘT lượt chỉ để lấy báo cáo.
async function chatWithInterview(id, res) {
  const st = interviews.get(id);
  try {
    await withSession(id, s0 => { s0.interviewPending = true; }).catch(() => {});
    const { chat } = require('./lib/ai');
    const raw = await chat(st.messages, { maxTokens: 4000, temperature: 0.6 });
    let { question, ended, report, mood } = parseInterviewTurn(raw);
    if (ended && !report) {
      try {
        const retryMsgs = [...st.messages, { role: 'user', content: '(Báo cáo vừa rồi bị cắt. Hãy xuất LẠI: in ===INTERVIEW_END=== trước, sau đó CHỈ MỘT JSON object đúng định dạng đã yêu cầu, ngắn gọn hơn.)' }];
        const raw2 = await chat(retryMsgs, { maxTokens: 4000, temperature: 0.4 });
        report = parseInterviewTurn(raw2).report;
      } catch { /* report null — UI có màn hình dự phòng */ }
    }
    st.messages.push({ role: 'assistant', content: raw });
    if (mood) st.mood = mood;
    await withSession(id, s => {
      s.interviewMessages = st.messages;
      s.interviewReport = ended ? (report || null) : s.interviewReport;
      s.interviewPending = false;
      if (mood) s.interviewMood = mood;
    }).catch(() => { /* session dir missing */ });
    if (ended) { st.ended = true; st.report = report; }
    res.json({ question, ended, report, mood: st.mood || mood || null });
  } catch (e) {
    console.error('[interview]', e);
    try {
      await withSession(id, s0 => { s0.interviewPending = false; });
    } catch { /* ignore */ }
    res.status(500).json({ error: e.friendly || 'AI không phản hồi được. Thử lại.' });
  }
}

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
