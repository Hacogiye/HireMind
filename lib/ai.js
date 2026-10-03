// lib/ai.js — AI client (OpenAI-compatible).
// AI_MODEL cho tác vụ text; AI_VISION_MODEL (tuỳ chọn) cho tác vụ nhìn ảnh (OCR, chat kèm ảnh).
// Tách 2 biến vì provider route alias khác nhau: alias text có thể rơi vào model
// không có vision — khi đó OCR hỏng kiểu "không nhìn thấy ảnh".
const AI_BASE_URL = process.env.AI_BASE_URL;
const AI_API_KEY = process.env.AI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || 'main_model';
const AI_VISION_MODEL = process.env.AI_VISION_MODEL || AI_MODEL;

if (!AI_BASE_URL || !AI_API_KEY) {
  console.error('⚠ Thiếu AI_BASE_URL / AI_API_KEY — chép .env.example thành .env rồi điền.');
}

// SSE stream thay vì chờ cả body: proxy (Cloudflare ~100s) cắt response dài không stream —
// các call phân tích sâu chạy vài phút, stream giữ connection sống.
const CHAT_TIMEOUT_MS = 120000;

// Phân loại lỗi HTTP từ AI provider: thông báo thân thiện cho UI + cờ noRetry
// (4xx trừ 429 — retry không thể giúp, ngừng ngay để không đốt thời gian/tiền).
function aiHttpError(status, body) {
  const map = {
    400: ['AI từ chối yêu cầu (HTTP 400) — payload có thể quá lớn hoặc model không hỗ trợ.', true],
    401: ['AI từ chối API key (HTTP 401) — kiểm tra lại AI_API_KEY.', true],
    402: ['Tài khoản AI hết số dư (HTTP 402) — nạp thêm cho AI provider rồi thử lại.', true],
    403: ['AI từ chối API key (HTTP 403) — kiểm tra quyền của AI_API_KEY.', true],
    404: ['Không tìm thấy endpoint/model AI (HTTP 404) — kiểm tra AI_BASE_URL và AI_MODEL.', true],
    429: ['AI đang quá tải (HTTP 429) — thử lại sau ít phút.', false],
  };
  const [msg, noRetry] = map[status] || [`AI provider tạm lỗi (HTTP ${status}) — thử lại sau ít phút.`, false];
  const err = new Error(`${msg}${body ? ` | ${body.slice(0, 120)}` : ''}`);
  err.friendly = msg;
  err.status = status;
  err.noRetry = noRetry;
  return err;
}

async function chat(messages, { maxTokens = 4000, temperature = 0.4, model = AI_MODEL } = {}) {
  let res;
  try {
    res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature, stream: true }),
      // Không có timeout = AI im lặng → caller chờ vĩnh viễn
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
  } catch (e) {
    if (e.name === 'TimeoutError' || /timeout|abort/i.test(e.message || '')) {
      const err = new Error('AI không phản hồi sau ' + CHAT_TIMEOUT_MS / 1000 + 's');
      err.friendly = 'AI phản hồi quá chậm — thử lại sau ít phút.';
      throw err;
    }
    const err = new Error('Không kết nối được AI endpoint — kiểm tra AI_BASE_URL / mạng.');
    err.friendly = err.message;
    throw err;
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw aiHttpError(res.status, body.slice(0, 300));
  }

  // Đọc stream SSE, ghép delta. Chỉ ghép delta.content — model có thể trả
  // reasoning_content (suy nghĩ nội bộ) song song; ghép nhầm sẽ dính "The image is..."
  // vào kết quả OCR/JSON.
  let raw = '';
  if (res.body && res.body.getReader) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      raw += dec.decode(value, { stream: true });
      if (raw.length > 2_000_000) {
        try { await reader.cancel(); } catch { /* bỏ qua */ }
        break;
      }
    }
  } else {
    raw = await res.text(); // endpoint không hỗ trợ stream — đọc cả body
  }

  // Hai dạng: SSE chunk ("data: {...}") hoặc JSON thuần
  // (một số endpoint gắn thêm tail "data: [DONE]" sau JSON).
  let content = '';
  if (raw.trimStart().startsWith('data:')) {
    for (const line of raw.split('\n')) {
      const m = line.match(/^data:\s*(\{.*\})\s*$/);
      if (!m) continue;
      try {
        const delta = JSON.parse(m[1])?.choices?.[0]?.delta;
        if (typeof delta?.content === 'string') content += delta.content;
      } catch { /* chunk lỗi — bỏ qua */ }
    }
  } else {
    // Body không phải SSE: có thể là JSON thuần hoặc HTML lỗi gateway.
    // ĐỪNG JSON.parse mù — check content-type + tìm object trước.
    let data = null;
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json')) {
      try { data = JSON.parse(raw); } catch { data = null; }
    } else {
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try { data = JSON.parse(raw.slice(start, end + 1)); } catch { data = null; }
      }
    }
    if (!data) {
      const err = new Error('AI trả về nội dung không hợp lệ (không phải JSON)');
      err.friendly = 'AI provider trả về phản hồi lạ — thử lại sau ít phút.';
      throw err;
    }
    const c = data?.choices?.[0]?.message?.content;
    if (typeof c === 'string') content = c;
  }

  // HTTP 200 vẫn có thể là thất bại: content rỗng = lỗi retryable
  if (!content.trim()) {
    const err = new Error('AI trả về nội dung rỗng');
    err.friendly = 'AI trả lời rỗng — thử lại sau ít phút.';
    throw err;
  }
  return content.trim();
}

// Trích JSON object đầu tiên khỏi output model — chịu được ```json fence,
// prose quanh JSON, chuỗi chứa ngoặc/escape (quét ngoặc cân bằng tôn trọng string).
function extractJson(text) {
  let t = text.replace(/```json\s*/gi, '```').trim();
  const fence = t.indexOf('```');
  if (fence !== -1) {
    const end = t.indexOf('```', fence + 3);
    if (end !== -1) t = t.slice(fence + 3, end);
  }
  const start = t.indexOf('{');
  if (start === -1) throw new Error('Không tìm thấy JSON trong phản hồi AI');
  let depth = 0, inStr = false, esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return JSON.parse(t.slice(start, i + 1));
    }
  }
  throw new Error('JSON từ AI không hợp lệ (không đóng đầy đủ)');
}

// chat + ép JSON; parse fail → 1 lần retry với câu lệnh strict (model hay thêm lời bình)
async function chatJson(messages, opts) {
  const raw = await chat(messages, opts);
  try {
    return extractJson(raw);
  } catch (e) {
    const retry = await chat(
      [...messages, { role: 'user', content: 'Phản hồi trước của bạn không parse được JSON. Trả lại CHỈ một JSON object hợp lệ, không thêm bất kỳ chữ nào khác.' }],
      opts
    );
    return extractJson(retry);
  }
}

// Vision OCR: trích toàn bộ text trong ảnh CV ra Markdown.
// LUÔN dùng AI_VISION_MODEL — alias text có thể là model không "nhìn" được ảnh.
async function ocrImage(base64, mime) {
  const out = await chat(
    [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
          { type: 'text', text: 'Trích xuất TOÀN BỘ text trong ảnh CV này ra dạng Markdown, giữ nguyên cấu trúc (tiêu đề, mục, bullet). CHỈ xuất nội dung văn bản — KHÔNG trả lời hội thoại, KHÔNG mô tả hành động sẽ làm, KHÔNG giải thích, KHÔNG bình luận. Nếu ảnh không phải trang CV/tài liệu, trả về đúng chuỗi: [NOT_DOCUMENT]' },
        ],
      },
    ],
    { maxTokens: 3000, temperature: 0.1, model: AI_VISION_MODEL }
  );
  const t = out.trim();
  if (t.includes('[NOT_DOCUMENT]')) return '';
  // Chống phản hồi hội thoại ("I'll take a look at the image first.") thay vì trích xuất:
  // ném lỗi để withRetry gọi lại, hết lượt thì thành warning của file.
  // Ngưỡng: <15 ký tự chắc chắn không phải text CV; pattern hội thoại neo đầu dòng.
  // (KHÔNG dùng ngưỡng 60 ký tự cứng — trang bìa ngắn hợp lệ sẽ bị nuốt oan.)
  if (t.length < 15 || /^(i'll|i will|let me|i'm going|sure,|of course|here('s| is))/i.test(t)) {
    const err = new Error('OCR trả về không đúng định dạng (có vẻ là phản hồi hội thoại)');
    throw err;
  }
  return t;
}

module.exports = { chat, chatJson, extractJson, ocrImage, aiHttpError, AI_BASE_URL, AI_MODEL, AI_VISION_MODEL };
