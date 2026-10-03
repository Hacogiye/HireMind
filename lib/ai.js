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
    throw new Error('AI HTTP ' + res.status + ' — ' + body.slice(0, 120));
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

module.exports = { chat, AI_BASE_URL, AI_MODEL, AI_VISION_MODEL };
