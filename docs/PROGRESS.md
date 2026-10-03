# HireMind — Progress log (ngày thi)

> Ghi mốc + quyết định trong 12 giờ thi. Commit đi đôi với dòng log.

| Thời điểm | Mốc / quyết định | Commit |
|---|---|---|
| 0:00 | Bắt đầu từ khung trắng | — |
| 0:00–0:15 | Bootstrap: security headers, static no-cache, /s/:id, middleware session id (regex chặn path traversal), token bucket rate limit | 3c79c3c…9081a27 |
| 0:15–1:05 | Session + upload: POST /api/session/new, multer vào data/<id>/uploads, POST /api/upload (fix UTF-8 filename, validate targetRole), GET /api/session/:id poll, wizard form + processing UI | f116f41…5a61022 |
| ~1:05 | fix: error middleware multer đặt sai vị trí (trước route) → 413 trả HTML 500; chuyển xuống sau routes | 5aaa239 |
| 1:10 | Test biên giờ 1 PASS: tên file tiếng Việt chuẩn (fix latin1→utf8), sai session id → 400, thiếu targetRole → 400, 16MB → 413 JSON, wizard browser e2e → phiên "Trong hàng đợi" | — |
