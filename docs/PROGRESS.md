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
| 2:35–3:45 | Pipeline nền: withSession hàng đợi ghi (test 10 mutation song song) + atomic write; lib/jd.js tầng direct + SSRF guard siết (IPv6/decimal/metadata + DNS rebinding + redirect manual — test 9 chặn/2 qua); 3 bước AI (validate/gộp, structureJD, analyzeCV temp 0.15 + caps + fallback hireAssessment); processSession 4 bước + stage progress + nhánh not-CV/thiếu role/JD chết fallback dán tay | *(lib/pipeline.js, lib/jd.js)* |
| ~3:00 | feat: server kick off pipeline qua hàng đợi + chặn upload rỗng + startup sweep (clear MỌI pending flag, kể cả rewritePending mà bản tham chiếu sót) + GET session trả dữ liệu phân tích | 2082d60 |
| 3:45 | Test e2e PASS: CV DOCX + JD dán tay → ready 75s, verdictLabel AI tự viết; not-CV → error + notCv flag không đốt token analyze; JD chết → fallback manual vẫn ready; restart giữa processing → sweep đánh dấu error, không spinner kẹt | — |
| 3:45–4:15 | JD fetch đủ 3 tầng: proxy reader (r.jina.ai, vượt site chặn fetch thường) + headless browser (Playwright lazy-require — host thiếu Chromium vẫn boot, tầng tự khai tử) + tự đảo ưu tiên browser-first cho TopCV/ITviec/VietnamWorks. Test thật: proxy 1081 ký tự, browser render 926 ký tự, fallback chain hoạt động (direct hụt → proxy thắng) | *(lib/jd.js)* |
