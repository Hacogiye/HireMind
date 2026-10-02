// lib/ai.js — TODO(ngày thi): AI client OpenAI-compatible.
// Việc cần làm:
// - chat(messages, opts): POST {AI_BASE_URL}/chat/completions; stream:true và tự ghép
//   SSE deltas (proxy Cloudflare chặn response dài không stream); opts.model để chọn model.
// - AI_VISION_MODEL: env RIÊNG cho tác vụ nhìn ảnh (OCR, chat kèm ảnh) — alias text có thể
//   route vào model KHÔNG có vision → OCR hỏng kiểu "không nhìn thấy ảnh". Fallback = AI_MODEL.
// - extractJson(text): quét ngoặc cân bằng, tôn trọng string/escape — chịu được ``` fence,
//   prose thừa, SSE tail "data: [DONE]".
// - chatJson(...): chat + ép JSON, retry 1 lần khi parse fail.
// - ocrImage(base64, mime): vision OCR → Markdown. CHỐNG phản hồi hội thoại ("I'll take a
//   look...") — kiểm tra định dạng đầu ra (độ dài/cấu trúc) + retry, hết lượt → warning.
// - aiHttpError: phân loại lỗi HTTP thành thông báo tiếng Việt thân thiện (401/402/403/404/
//   429/5xx) + cờ noRetry cho 4xx trừ 429 (retry không thể giúp — đừng đốt thời gian).
// Env: AI_BASE_URL, AI_API_KEY, AI_MODEL, AI_VISION_MODEL (xem .env.example).
module.exports = {};
