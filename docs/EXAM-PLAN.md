# Kế hoạch ngày thi — HireMind (9 tiếng: 8 xây + 1 bàn luận)

## Quy định áp dụng (ngày thi)

1. Được chuẩn bị trước **khung code trắng** (Project Template, cài sẵn Database/Thư viện).
2. **Toàn bộ dòng code logic nghiệp vụ** phải được thực hiện và **commit trên GitHub trong thời gian thi**.

→ Template này đúng phạm vi được phép: khung + deps, không có logic.
→ Giám khảo đọc timeline commit để xác minh quá trình làm thật → **commit nhỏ, đều, liên tục** (mục "Quy tắc commit" bên dưới).

## Thời lượng thực tế

- Tổng **9 tiếng** theo BTC (trong đó có **3 tiếng chấm điểm**).
- Kế hoạch nhóm: **8 tiếng xây dựng** — deadline cứng: hết giờ thứ 8 mọi logic phải đã commit —
  và **1 tiếng cuối bàn luận với thành viên** (rehearse demo, rà test biên, dọn docs;
  chỉ fix bug nhỏ + commit ngay, **không viết tính năng mới** trong giờ này).
- Vì có 3 tiếng chấm điểm xen trong ngày, demo phải "sẵn sàng trình bày" sớm: sau mốc
  Dashboard (giờ ~6:30) sản phẩm đã phải demo được end-to-end dù còn tính năng dang dở.

## Quy tắc commit (bắt buộc — giám khảo đọc timeline)

1. **Commit mỗi 15–30 phút** hoặc ngay sau mỗi đơn vị công việc chạy được (1 hàm, 1 endpoint, 1 khối UI). Không bao giờ dồn thành 1 commit lớn cuối mốc.
2. **1 commit = 1 việc cụ thể.** Message kiểu: `feat: ...`, `fix: ...`, `chore: ...`, `docs: ...` + mô tả ngắn tiếng Việt không dấu. Bug phát hiện khi test → **commit `fix:` riêng** — lịch sử có fix là dấu hiệu làm thật, đừng sửa nuốt vào commit cũ.
3. **KHÔNG amend, KHÔNG force-push, KHÔNG rebase khi thi** — lịch sử thẳng, chỉ tiến tới, chính là timeline bằng chứng.
4. **Push sau mỗi mốc** (không chỉ commit local) — giám khảo xem trên GitHub, không xem máy mình.
5. Commit giữa chừng một file đang dở là bình thường, miễn server vẫn boot (`npm start` không chết).
6. Trước mỗi `git add`: liếc `git status` + `git diff` — chắc không có `.env`, key, `data/` lọt vào (`.gitignore` đã chặn nhưng đừng ghi đè cưỡng bức bằng `-f`).

### Ví dụ chuỗi commit đúng nhịp (một mốc = nhiều commit nhỏ)

```
feat: ai client chat() co ban (non-stream)
fix: ghep SSE stream + tail data:[DONE] tu endpoint
feat: extractJson quet ngoac can bang, chiu markdown fence
feat: ocr anh CV qua vision
feat(wizard): pdf.js lay text + render trang scan thanh anh
```

## Trước ngày thi (checklist)

- [x] Template khung trắng `hiremind-template/` — deps cài sẵn, git init, không logic
- [x] Repo GitHub `https://github.com/Hacogiye/HireMind.git` — remote `origin` đã nối, khung đã push (`main`)
- [ ] Test AI endpoint còn sống: điền `.env`, `npm start`, curl `/api/health` + 1 call AI thật
- [ ] Chuẩn bị dữ liệu demo: 1-2 CV (PDF + ảnh chụp) + 2-3 link JD (TopCV + 1 site thường) + 1 file KHÔNG phải CV (test biên)
- [ ] Xem lại bản tham chiếu đầy đủ (HireMind v14 tại `Downloads/HireMind`) để nắm trình tự + các bẫy
- [ ] Rehearse demo flow 60 giây 1 lần
- [ ] Kiểm tra máy ngày thi: `git config user.name/user.email`, đăng nhập GitHub credential manager sẵn

## Mốc 8 giờ xây dựng

| Giờ | Việc |
|---|---|
| 0:00–0:30 | Verify khung + `npm start` + health; dựng khung server (headers, static, middleware session id) |
| 0:30–1:30 | Tạo phiên + upload (multer) + trả link; wizard client gửi file + meta |
| 1:30–3:00 | Trích xuất (pdf.js client: text + ảnh trang scan; DOCX/TXT server) + AI client (stream SSE, extractJson) + vision OCR |
| 3:00–4:15 | Pipeline nền: validate/gộp CV → cấu trúc JD → phân tích (JSON schema); stage vào session.json; nhánh not-CV / thiếu vị trí |
| 4:15–5:00 | Fetch JD nhiều tầng + SSRF guard + fallback dán tay |
| 5:00–6:30 | Dashboard: poll + render kết quả (điểm, breakdown, ATS match, roadmap, red flags) — **sau mốc này phải demo được end-to-end** |
| 6:30–7:30 | Chat Coach + Mock Interview (persist transcript, retry report cắt) |
| 7:30–7:50 | Deploy host + smoke test end-to-end THẬT (upload → ready → chat) |
| 7:50–8:00 | Commit + push cuối giờ thứ 8 — **sau mốc này KHÔNG viết logic mới** |

### Ví dụ chuỗi commit theo mốc

- **Bootstrap**: `chore: security headers + json body limit` → `chore: static + route /s/:id` → `feat: middleware kiem tra session id`
- **Session + upload**: `feat: POST /api/session/new tao phien` → `feat: multer storage vao data/<id>/uploads` → `feat: POST /api/upload nhan meta + tra link` → `feat(wizard): form chon file + goi api`
- **Extraction + AI**: chuỗi ví dụ ở mục "Quy tắc commit"
- **Pipeline**: `feat: helpers read/write/patch session` → `feat: buoc validate + gop CV` → `feat: nhanh not-CV + thieu vi tri` → `feat: buoc analyze JSON schema` → `feat: stage progress vao session.json`
- **JD fetch**: `feat: fetch direct + SSRF guard` → `feat: tang proxy reader` → `feat: tang headless browser (lazy-require)` → `feat: fallback dan JD tay`
- **Dashboard**: `feat: poll trang thai + man processing` → `feat: hero diem + breakdown` → `feat: tab doi chieu JD` → `feat: roadmap + red flags` → `fix: responsive khi test`
- **Chat + Interview**: `feat: POST chat + lich su persist` → `feat(ui): tab chat + markdown` → `feat: interview start/reply + parser marker` → `fix: retry report khi JSON bi cat` → `feat(ui): man bao cao phong van`
- **Deploy**: `chore: deploy host verified end-to-end`

## Giờ thứ 9 — bàn luận cuối với thành viên

- Rehearse demo flow 60 giây, phân vai ai nói phần nào
- Rà checklist test biên, chụp màn hình dự phòng (phòng mạng/AI endpoint trục quẹt)
- Dọn `docs/PROGRESS.md` + `docs/ARCHITECTURE.md`, commit + push cuối
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
