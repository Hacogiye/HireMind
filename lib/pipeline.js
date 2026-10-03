// lib/pipeline.js — pipeline xử lý NỀN sau upload (user thoát trang vẫn chạy).
// Giờ 2: session helpers + withRetry + extractContent (trích xuất nội dung CV).
// Giờ 2:35: withSession/patchSession (hàng đợi ghi theo phiên) + processSession
// (orchestration 4 bước: extract → validate → jd → analyze).
const fs = require('fs');
const path = require('path');
const mammoth = require('mammoth');
const { ocrImage } = require('./ai');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SESSION_RE = /^[a-f0-9]{12}$/;

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
function writeSession(session) {
  const file = path.join(sessionDir(session.id), 'session.json');
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(session, null, 2));
  fs.renameSync(tmp, file);
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

module.exports = { sessionDir, readSession, writeSession, withSession, patchSession, withRetry, extractContent, DATA_DIR, SESSION_RE };
