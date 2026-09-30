# Kế hoạch ngày thi — HireMind (9 tiếng: 8 xây + 1 bàn luận)

## Quy định áp dụng (ngày thi)

1. Được chuẩn bị trước **khung code trắng** (Project Template, cài sẵn Database/Thư viện).
2. **Toàn bộ dòng code logic nghiệp vụ** phải được thực hiện và **commit trên GitHub trong thời gian thi**.

→ Template này đúng phạm vi được phép: khung + deps, không có logic.
→ Chiến lược: commit GitHub **liên tục sau mỗi mốc** (không gom cuối giờ).

## Thời lượng thực tế

- Tổng **9 tiếng** theo BTC (trong đó có **3 tiếng chấm điểm**).
- Kế hoạch nhóm: **8 tiếng xây dựng** — deadline cứng: hết giờ thứ 8 mọi logic phải đã commit —
  và **1 tiếng cuối bàn luận với thành viên** (rehearse demo, rà test biên, dọn docs;
  chỉ fix bug nhỏ + commit ngay, **không viết tính năng mới** trong giờ này).
- Vì có 3 tiếng chấm điểm xen trong ngày, demo phải "sẵn sàng trình bày" sớm: sau mốc
  Dashboard (giờ ~6:30) sản phẩm đã phải demo được end-to-end dù còn tính năng dang dở.

## Trước ngày thi (checklist)

- [x] Template khung trắng `hiremind-template/` — deps cài sẵn, git init, không logic
- [x] Repo GitHub `https://github.com/Hacogiye/HireMind.git` — remote `origin` đã nối, khung đã push (`main`)
- [ ] Test AI endpoint còn sống: điền `.env`, `npm start`, curl `/api/health` + 1 call AI thật
- [ ] Chuẩn bị dữ liệu demo: 1-2 CV (PDF + ảnh chụp) + 2-3 link JD (TopCV + 1 site thường) + 1 file KHÔNG phải CV (test biên)
- [ ] Xem lại bản tham chiếu đầy đủ (HireMind v14 tại `Downloads/HireMind`) để nắm trình tự + các bẫy
- [ ] Rehearse demo flow 60 giây 1 lần

## Mốc 8 giờ xây dựng (commit sau MỖI dòng)

| Giờ | Việc | Commit mục tiêu |
|---|---|---|
| 0:00–0:30 | Verify khung + `npm start` + health; dựng khung server (headers, static, middleware session id) | `chore: bootstrap` |
| 0:30–1:30 | Tạo phiên + upload (multer) + trả link; wizard client gửi file + meta | `feat: session + upload` |
| 1:30–3:00 | Trích xuất (pdf.js client: text + ảnh trang scan; DOCX/TXT server) + AI client (stream SSE, extractJson) + vision OCR | `feat: extraction + ai client` |
| 3:00–4:15 | Pipeline nền: validate/gộp CV → cấu trúc JD → phân tích (JSON schema); stage vào session.json; nhánh not-CV / thiếu vị trí | `feat: analyze pipeline` |
| 4:15–5:00 | Fetch JD nhiều tầng + SSRF guard + fallback dán tay | `feat: jd fetch` |
| 5:00–6:30 | Dashboard: poll + render kết quả (điểm, breakdown, ATS match, roadmap, red flags) — **sau mốc này phải demo được end-to-end** | `feat: dashboard` |
| 6:30–7:30 | Chat Coach + Mock Interview (persist transcript, retry report cắt) | `feat: coach + interview` |
| 7:30–7:50 | Deploy host + smoke test end-to-end THẬT (upload → ready → chat) | `chore: deploy verified` |
| 7:50–8:00 | Commit cuối giờ thứ 8 — **sau mốc này KHÔNG viết logic mới** | `final` |

## Giờ thứ 9 — bàn luận cuối với thành viên

- Rehearse demo flow 60 giây, phân vai ai nói phần nào
- Rà checklist test biên, chụp màn hình dự phòng (phòng mạng/AI endpoint trục quẹt)
- Dọn `docs/PROGRESS.md` + `docs/ARCHITECTURE.md`, commit cuối
- Bug phát hiện trong giờ này: chỉ fix nhỏ, commit ngay — không thêm tính năng

## Thứ tự cắt giảm nếu thiếu giờ

Cover Letter → DOCX export → dark mode → responsive.
**Không bao giờ** cắt: pipeline chính + dashboard + phiên có link riêng (lõi đề bài).

## Bẫy đã biết (từ bản tham chiếu — tránh lặp lại)

- Endpoint AI trả kèm SSE tail `data: [DONE]` / markdown fence → parser JSON phải chắc (quét ngoặc cân bằng, tôn trọng string).
- TopCV/ITviec chặn Cloudflare → cần tầng headless browser; host shared không có Chromium → **luôn có ô dán JD tay** làm đường thoát.
- Báo cáo phỏng vấn (JSON dài) bị cắt khi maxTokens nhỏ → dùng ≥4000 và có 1 lượt retry xin lại report.
- LiteSpeed trên host gắn cache 7 ngày cho HTML → phải set `Cache-Control: no-cache` cho HTML.
- Multer decode sai tên file UTF-8 (tiếng Việt) → `Buffer.from(name,'latin1').toString('utf8')`.
- Session id phải khớp regex chặt TRƯỚC khi dùng làm đường dẫn (path traversal).
- Restart server giữa lúc xử lý → session kẹt "processing" vĩnh viễn → cần startup sweep.
- Ghi session.json từ nhiều nơi (pipeline + chat + interview) → cần hàng đợi ghi/đọc-lại-trước-ghi chống mất dữ liệu.

## Test biên bắt buộc trước khi nộp

- [ ] File không phải CV → thông báo thân thiện, không crash
- [ ] Thiếu "vị trí nhắm tới" → chặn từ đầu, không tốn token AI
- [ ] JD link chết → phiên vẫn phân tích phần CV (thông báo rõ)
- [ ] Reload giữa chat/interview → hội thoại không mất
- [ ] CV dạng ảnh chụp mờ → OCR hoặc cảnh báo rõ, không treo
- [ ] Server restart → không có session kẹt spinner
