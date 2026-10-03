# HireMind — Progress log (ngày thi)

> Ghi mốc + quyết định trong 12 giờ thi. Commit đi đôi với dòng log.

| Thời điểm | Mốc / quyết định | Commit |
|---|---|---|
| 0:00 | Bắt đầu từ khung trắng | — |
| 0:00–0:15 | Bootstrap: security headers, static no-cache, /s/:id, middleware session id (regex chặn path traversal), token bucket rate limit | 3c79c3c…9081a27 |
| 0:15–1:05 | Session + upload: POST /api/session/new, multer vào data/<id>/uploads, POST /api/upload (fix UTF-8 filename, validate targetRole), GET /api/session/:id poll, wizard form + processing UI | f116f41…5a61022 |
| ~1:05 | fix: error middleware multer đặt sai vị trí (trước route) → 413 trả HTML 500; chuyển xuống sau routes | 5aaa239 |
| 1:10 | Test biên giờ 1 PASS: tên file tiếng Việt chuẩn (fix latin1→utf8), sai session id → 400, thiếu targetRole → 400, 16MB → 413 JSON, wizard browser e2e → phiên "Trong hàng đợi" | — |
| 1:10–1:25 | fix: busboy giới hạn mặc định 1MB/form field — clientPdfImages (base64 scan) sẽ chết 500 im lặng; nâng fieldSize 20MB | 1f4c798 |
| 1:25–2:05 | lib/ai.js: chat() stream SSE (chỉ ghép delta.content, bỏ reasoning_content; timeout 120s; parse non-SSE an toàn) → extractJson quét ngoặc cân bằng + chatJson retry → ocrImage vision + guard hội thoại (ngưỡng 15 ký tự, không dùng 60 cứng — tránh nuốt trang bìa ngắn) → aiHttpError thân thiện + noRetry. Test thật: chat OK, OCR ảnh CV giả trích đúng, key sai → 401 thân thiện | *(lib/ai.js)* |
| 2:05–2:25 | lib/pipeline.js: sessionDir (chặn path traversal) + read/writeSession + withRetry (tôn trọng noRetry) + extractContent (TXT/MD/DOCX/PDF/ảnh OCR ≤8 trang; xóa clientPdfText/Images sau extract). Test: DOCX thật 2388 ký tự, ảnh rác → warning thân thiện | *(lib/pipeline.js)* |
| 2:05–2:30 | public: pdf.js 3.11.174 local (không CDN — CSP 'self' + offline) + wizard extractPdf (trang <80 ký tự = scan → ảnh scale 2/JPEG 0.7/cap 1600px/≤8 trang; 1 field clientPdfText duy nhất) | *(public/*)* |
| 2:25–2:35 | Test tích hợp: wizard e2e với PDF 3 trang → session có text 231 ký tự + 1 ảnh scan 14KB; extractContent OCR AI thật đọc đúng trang scan; field 2MB qua FormData → 200 (trước fix sẽ LIMIT_FIELD_VALUE) | — |
