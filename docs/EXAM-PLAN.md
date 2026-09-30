# Kế hoạch 12 giờ ngày thi — HireMind

## Quy định áp dụng (ngày thi)

1. Được chuẩn bị trước **khung code trắng** (Project Template, cài sẵn Database/Thư viện).
2. **Toàn bộ dòng code logic nghiệp vụ** phải được thực hiện và **commit trên GitHub trong 12 giờ thi**.

→ Template này đúng phạm vi được phép: khung + deps, không có logic.
→ Chiến lược: commit GitHub **liên tục sau mỗi mốc** (không gom cuối giờ).

## Trước ngày thi (checklist)

- [x] Template khung trắng `hiremind-template/` — deps cài sẵn, git init, không logic
- [ ] Tạo repo GitHub trống + `git remote add origin <url>` + push commit khung
- [ ] Test AI endpoint còn sống: điền `.env`, `npm start`, curl `/api/health` + 1 call AI thật
- [ ] Chuẩn bị dữ liệu demo: 1-2 CV (PDF + ảnh chụp) + 2-3 link JD (TopCV + 1 site thường) + 1 file KHÔNG phải CV (test biên)
- [ ] Xem lại bản tham chiếu đầy đủ (HireMind v14 tại `Downloads/HireMind`) để nắm trình tự + các bẫy
- [ ] Rehearse demo flow 60 giây 1 lần

## Mốc 12 giờ (commit sau MỖI dòng)

| Giờ | Việc | Commit mục tiêu |
|---|---|---|
| 0:00–0:30 | Push template, verify `npm start` + health; dựng khung server (headers, static, middleware session id) | `chore: bootstrap` |
| 0:30–2:00 | Tạo phiên + upload (multer) + trả link; wizard client gửi file + meta | `feat: session + upload` |
| 2:00–4:00 | Trích xuất: pdf.js client (text + ảnh trang scan), DOCX/TXT server; AI client (stream + JSON) + vision OCR | `feat: extraction + ai client` |
| 4:00–5:30 | Pipeline nền: validate/gộp CV → cấu trúc JD → phân tích (JSON schema); stage vào session.json; nhánh not-CV / thiếu vị trí | `feat: analyze pipeline` |
| 5:30–6:30 | Fetch JD nhiều tầng + SSRF guard + fallback dán tay | `feat: jd fetch` |
| 6:30–8:30 | Dashboard: poll + render kết quả (điểm, breakdown, ATS match, roadmap, red flags) | `feat: dashboard` |
| 8:30–10:00 | Chat Coach + Mock Interview (persist transcript, report, retry report cắt) + Cover Letter | `feat: coach + interview + letter` |
| 10:00–10:45 | Xuất DOCX, light/dark mode, responsive cơ bản | `feat: export + polish` |
| 10:45–11:30 | Deploy host + smoke test end-to-end THẬT (upload → ready → chat) | `chore: deploy verified` |
| 11:30–12:00 | Buffer: fix lỗi, test biên, commit cuối | `final` |

> Nếu thiếu giờ, thứ tự cắt giảm: DOCX → dark mode → responsive. **Không bao giờ** cắt pipeline chính + dashboard.

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
