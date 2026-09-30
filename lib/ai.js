// lib/ai.js — TODO(ngày thi): AI client OpenAI-compatible.
// Việc cần làm:
// - chat(messages, opts): POST {AI_BASE_URL}/chat/completions với Bearer key;
//   nên dùng stream:true và tự ghép SSE deltas (proxy chặn response dài không stream).
// - extractJson(text): tách JSON object đầu tiên khỏi output AI (chịu được ``` fence / prose).
// - chatJson(...): chat + ép JSON, retry 1 lần khi parse fail.
// - ocrImage(base64, mime): vision OCR — ảnh CV trang scan → text Markdown.
// Env: AI_BASE_URL, AI_API_KEY, AI_MODEL (xem .env.example). Thiếu env → cảnh báo rõ.
module.exports = {};
