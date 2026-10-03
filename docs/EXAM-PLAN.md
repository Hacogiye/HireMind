# Kế hoạch ngày thi — HireMind (9 tiếng BTC: 7 xây + 2 bàn luận/rehearse)

## Quy định áp dụng (ngày thi)

1. Được chuẩn bị trước **khung code trắng** (Project Template, cài sẵn Database/Thư viện).
2. **Toàn bộ dòng code logic nghiệp vụ** phải được thực hiện và **commit trên GitHub trong thời gian thi**.

→ Template này đúng phạm vi được phép: khung + deps, không có logic.
→ Giám khảo đọc timeline commit để xác minh quá trình làm thật → **commit nhỏ, đều, liên tục**.

## Thời lượng thực tế

- Tổng **9 tiếng** theo BTC (có **3 tiếng chấm điểm**) → sau mốc ~6:00 phải **demo được end-to-end**.
- Kế hoạch nhóm: **7 tiếng xây dựng** (deadline cứng — hết giờ 7 mọi logic đã commit) +
  **2 tiếng cuối bàn luận với thành viên** (rehearse demo, rà test biên, chỉ fix nhỏ + commit ngay).
- Lý do rút còn 7 tiếng: dự phòng trượt tiến độ — nếu mốc Dashboard bị kéo dài thì vẫn còn đệm
  trước mốc 6:00 chấm demo; các mốc đã nén sẵn, KHÔNG dồn việc sang muộn hơn mốc 6:45.

## Sản phẩm đích 7 tiếng (phạm vi chức năng)

**Lõi — không được cắt:**
- Upload đa định dạng (PDF/DOCX/TXT/ảnh OCR) + nhập tay khi không có file
- JD 3 tầng (direct → proxy → browser; đảo thứ tự job boards VN) + fallback dán tay
- Pipeline nền 4 bước, stage progress, hàng đợi ghi session.json
- Phân tích JSON: điểm 4 tiêu chí, hireAssessment (**verdictLabel do AI tự viết**), match có
  bằng chứng + severity, roadmap, alternativePaths, hardQuestions, red flags
- Dashboard: hero compact (3 stat chip bấm nhảy tab) + tabs Tổng quan / Đối chiếu / Lộ trình
- **Viết lại CV 2 chế độ** (Cấu trúc & làm nổi bật / Bổ sung kỹ năng còn thiếu có ghi chú trung
  thực) — điểm nhấn giám khảo chỉ đạo: "AI không chỉ chấm mà còn trực tiếp sửa CV"
- **Xuất CV thiết kế .docx** (banner màu, ô dán ảnh 3×4, heading màu, ngày căn phải)
- **Nạp CV kiểm chứng → panel so sánh trước/sau** (vòng: phân tích → sửa → kiểm chứng lại)
- Cover Letter (letterhead, ≤3 số liệu, CTA tự tin) + **Mở Gmail soạn thư** (to/cc/bcc)

**Cắt nếu thiếu giờ (theo thứ tự):** Mock Interview → Chat Coach → dark mode → responsive tinh chỉnh.
**Không bao giờ cắt:** pipeline + dashboard + Viết lại CV + vòng kiểm chứng.

## Quy tắc commit (bắt buộc — giám khảo đọc timeline)

1. **Commit mỗi 15–30 phút** hoặc ngay sau mỗi đơn vị chạy được. Không dồn cuối mốc.
2. **1 commit = 1 việc cụ thể** (`feat:`/`fix:`/`chore:` + mô tả ngắn tiếng Việt không dấu).
   Bug phát hiện khi test → **commit `fix:` riêng** — lịch sử có fix là bằng chứng làm thật.
3. **KHÔNG amend, KHÔNG force-push, KHÔNG rebase khi thi** — lịch sử thẳng là timeline.
4. **Push sau mỗi mốc** — giám khảo xem trên GitHub, không xem máy mình.
5. Commit file dở giữa chừng OK, miễn `npm start` không chết.
6. Trước mỗi `git add`: liếc `git status` + `git diff` — không để `.env`/key/`data/` lọt.

## Bản đồ phân quyền file (3 thành viên — mỗi file ĐÚNG MỘT chủ)

| Chủ | File sở hữu (không ai khác đụng) | Phạm vi chức năng |
|---|---|---|
| **Nhóm trưởng** | `server.js`, `package.json`, `dotenv.js`, `.gitignore`, `docs/` | Khung server, tất cả routes API, session, deploy. Định nghĩa hợp đồng interface cho các lib |
| **Đạt** — Backend & Data Extraction | `lib/ai.js`, `lib/pipeline.js`, `lib/jd.js` | AI client (SSE, extractJson, OCR, lỗi thân thiện), pipeline 4 bước + hàng đợi ghi + trích xuất đa định dạng, fetch JD 3 tầng vượt Cloudflare + SSRF guard |
| **Hải** — Frontend & UX/UI | `public/index.html`, `public/session.html`, `public/css/*`, `public/js/*` | Wizard (+pdf.js client), processing UI, dashboard 3 tabs, panel so sánh, Gmail compose |
| **Thiện** — QA & Product Delivery | `lib/services.js`, `lib/docx.js`, `docs/TESTING.md` | Prompts phân tích/rewrite/cover letter (chất lượng đầu ra), xuất Markdown→DOCX + CV thiết kế (ô ảnh 3×4); ngoài repo: dữ liệu demo, kịch bản demo, rehearse |

Quy tắc sống còn của bản đồ:
- **Hợp đồng interface trước, code sau**: chữ ký export của từng lib được chốt ngay khi bắt đầu mốc (ghi sẵn trong stub comment) — phần gọi (server.js) và phần được gọi (lib/*) bám đúng hợp đồng, không cần đợi nhau.
- File của ai chỉ người đó commit.
- Conflict không thể xảy ra nếu tuân thủ bản đồ — vì không hai người cùng sửa một file.
- Mỗi thành viên **phải chạy thử + hiểu được phần mình** trước khi commit — khi demo, người trình bày phần đó là chính chủ file.

## Phối hợp nhóm trong giờ thi

Nhóm chia việc theo bản đồ phân quyền ở trên: mỗi người phát triển và commit phần mình
bằng Git riêng (`user.name`/`user.email` riêng, được mời làm collaborator của repo) để
timeline trên GitHub thể hiện đúng người làm đúng phần.

- Người có thắc mắc phần interface hỏi ngay trong lúc mốc đang chạy — không chờ đến khi
  commit mới hỏi.
- Mỗi người chạy `git config pull.rebase true` sau khi clone — người push sau bị từ chối
  thì `git pull` tự đặt commit của họ lên trên commit vừa có, timeline thẳng, không sinh
  commit "Merge branch".
- Push bị từ chối do người khác push trước: `git pull` rồi `git push` lại. Tuyệt đối
  không `--force`/amend/rebase các commit ĐÃ PUSH — lịch sử thẳng là timeline.
- Ai chậm/quên commit: phần việc đó vẫn phải lên repo trước khi kết thúc mốc chứa nó —
  nhóm trưởng nhắc trực tiếp, không để mốc sau phải đợi.

## Trước ngày thi (checklist)

- [x] Template khung trắng `hiremind-template/` — deps cài sẵn, git init, không logic
- [x] Repo GitHub `https://github.com/Hacogiye/HireMind.git` — remote `origin` đã nối
- [x] **Test AI endpoint cả TEXT và VISION** — ✅ ĐÃ PASS (ngày 2026-10-03, trước ngày thi):
      text OK; vision OK (ảnh đỏ → trả "Đỏ."); endpoint trả SSE có `reasoning_content` riêng
      với `content` → parser phải đọc `delta.content`, không nhét reasoning vào kết quả
- [ ] Chuẩn bị dữ liệu demo: 1-2 CV (PDF + ảnh chụp) + 2-3 link JD (TopCV + site thường) + 1 file
      KHÔNG phải CV + 1 JD dán tay sẵn (phòng mạng)
- [ ] Xem lại bản tham chiếu v16 (`Downloads/HireMind`) — đặc biệt: 2 chế độ rewrite, chuẩn
      cover letter (letterhead/≤3 số/CTA), vòng kiểm chứng, hàng đợi ghi
- [ ] Rehearse demo 60 giây: upload → phân tích → **viết lại (2 chế độ) → xuất Word (ô ảnh) →
      nạp kiểm chứng → so sánh điểm → cover letter → Gmail** — đây là arc pitching
- [ ] Kiểm tra máy ngày thi: `git config user.name/user.email`, đăng nhập GitHub credential manager

## Mốc 7 giờ xây dựng (commit sau MỖI đơn vị — "Chủ" = ai commit file đó)

| Giờ | Việc | Chủ |
|---|---|---|
| 0:00–0:15 | Verify khung + health; khung server (headers, static, middleware session id, body limit) | Nhóm trưởng |
| 0:15–1:10 | Session + upload (multer, tên file UTF-8) + trả link; wizard client gửi file + meta | Nhóm trưởng + Hải* |
| 1:10–2:35 | Trích xuất (pdf.js text + ảnh scan; DOCX/TXT server) + AI client (stream SSE, extractJson, OCR chống hội thoại, tách AI_VISION_MODEL, phân loại lỗi, đọc delta.content bỏ reasoning_content) | **Đạt** + Hải (wizard pdf.js) |
| 2:35–3:45 | Pipeline nền: validate/gộp CV → JD → phân tích JSON schema đầy đủ (verdictLabel, alternativePaths) + stage progress + hàng đợi ghi + nhánh not-CV/thiếu vị trí | **Đạt** |
| 3:45–4:15 | Fetch JD 3 tầng + SSRF guard + fallback dán tay | **Đạt** |
| 4:15–5:25 | Dashboard: hero compact (3 stat chip bấm nhảy tab) + tabs Tổng quan/Đối chiếu/Lộ trình — **sau mốc này demo được end-to-end (trước mốc 6:00 chấm demo)** | **Hải** |
| 5:25–6:10 | **Viết lại CV 2 chế độ** (services.js prompt + mode cards UI + cảnh báo tham khảo) + **xuất CV thiết kế .docx** | **Thiện** (services + docx) + **Hải** (UI) |
| 6:10–6:40 | Nạp CV kiểm chứng (phiên con + parentSessionId) + panel so sánh + Cover Letter + Gmail compose | Nhóm trưởng (reupload route) + **Thiện** (prompt) + **Hải** (UI) |
| 6:40–6:50 | Deploy host (Run NPM Install + env) + smoke test end-to-end THẬT | Nhóm trưởng |
| 6:50–7:00 | Buffer + commit/push cuối — **sau mốc này KHÔNG viết logic mới** | — |

\* Wizard khung (form + upload) giờ 1 đã commit trong khung — từ giờ 2 mọi sửa đổi `public/` thuộc Hải.

> Mock Interview, Chat Coach, dark mode, responsive tinh chỉnh: **không xây** (cắt mặc định ở lộ trình 7 giờ).
> Nếu một mốc trượt: cắt bớt phạm vi TRONG mốc đó (VD: JD fetch chỉ cần tầng direct + fallback dán tay nếu ít giờ),
> đừng đẩy việc sang mốc sau — mọi mốc sau đã nén tối đa.
> Trượt kéo dài file của TV: bạn vẫn code tiếp phần sau nhờ hợp đồng interface — phần nào sẵn sàng thì người đó commit phần đó,
> thứ tự commit lệch một chút không sao, miễn không amend.

### Ví dụ chuỗi commit theo mốc

- **Bootstrap**: `chore: security headers + json body limit` → `chore: static + route /s/:id` → `feat: middleware kiem tra session id`
- **Session + upload**: `feat: POST /api/session/new` → `feat: multer storage vao data/<id>/uploads` → `feat: POST /api/upload nhan meta + tra link` → `feat(wizard): form chon file + goi api`
- **Extraction + AI**: `feat: ai client chat() stream SSE` → `fix: ghep SSE tail data:[DONE]` → `feat: extractJson quet ngoac can bang` → `feat: ocrImage + guard phan hoi hoi thoai` → `feat: AI_VISION_MODEL tach model vision` → `feat: phan loai loi AI than thien + noRetry` → `feat(wizard): pdf.js text + anh scan`
- **Pipeline**: `feat: read/write/patch + hang doi withSession` → `feat: buoc validate + gop CV` → `feat: nhanh not-CV + thieu vi tri` → `feat: analyze JSON (verdictLabel, hireAssessment, altpaths)` → `feat: stage progress vao session.json`
- **JD fetch**: `feat: fetch direct + SSRF guard` → `feat: tang proxy reader` → `feat: tang headless browser (lazy-require)` → `feat: fallback dan JD tay`
- **Dashboard**: `feat: poll + processing UI` → `feat: hero compact 3 stat bam nhay tab` → `feat: tab tong quan (hire panel, altpaths, red flags)` → `feat: tab doi chieu JD + lo trinh` → `fix: z-index tooltip vs sticky tabs`
- **Viết lại CV**: `feat: rewriteCV che do reshape (X-YZ, khong bia)` → `feat: che do addskills (muc bo sung, type add)` → `feat(ui): mode cards + canh bao tham khao` → `feat: xuat CV thiet ke docx (o anh 3x4)` → `fix: phuc hoi email/SDT bi AI che`
- **Vòng kiểm chứng + thư**: `feat: /reupload phien con ke thua meta` → `feat: panel so sanh truoc/sau` → `feat: cover letter chuan (letterhead, ≤3 so, CTA)` → `feat: mo gmail compose (to/cc/bcc)` → `fix: chong lap tieu de gmail`
- **Deploy**: `chore: deploy host verified end-to-end`

## Giờ 8–9 — bàn luận cuối với thành viên

- Rehearse demo arc: phân tích → **viết lại (2 chế độ) → xuất Word → nạp kiểm chứng → so sánh
  điểm → cover letter → Gmail** — nhấn mạnh thông điệp "AI trực tiếp sửa CV, không chỉ chấm"
- Rà checklist test biên, chụp màn hình dự phòng (phòng AI endpoint trục trặc)
- Dọn `docs/PROGRESS.md`, commit + push cuối
- Bug phát hiện: chỉ fix nhỏ, commit ngay — không thêm tính năng

## Bẫy đã biết (từ bản tham chiếu v16 — tránh lặp lại)

**AI / model:**
- Model trả SSE với `reasoning_content` (suy nghĩ nội bộ) TÁCH RIÊNG khỏi `content` (đáp án) → parser stream phải gom `delta.content`, tuyệt đối không ghép `reasoning_content` vào kết quả (khiến OCR/JSON phân tích dính "The image is..." kiểu suy luận)
- Model alias có thể KHÔNG có vision (route vào model text) → OCR hỏng "không nhìn thấy ảnh" → tách `AI_VISION_MODEL`, test vision TRƯỚC ngày thi (✅ đã test PASS)
- OCR thỉnh thoảng trả hội thoại ("I'll take a look...") → kiểm tra định dạng đầu ra + retry
- AI có thói quen CHE email/SĐT thành placeholder khi viết lại → hậu xử lý phục hồi từ cleanedCv (regex email/phone)
- Điểm chấm variance lớn giữa các lần (cùng CV chấm 67 rồi 20) → temperature 0.15 + disclaimer
- Endpoint trả kèm SSE tail `data: [DONE]` / markdown fence → parser JSON quét ngoặc cân bằng
- Báo cáo phỏng vấn (JSON dài) bị cắt khi maxTokens nhỏ → ≥4000 + 1 lượt retry lấy report

**Kỹ thuật:**
- Ghi session.json từ nhiều luồng (pipeline/chat/rewrite) → HÀNG ĐỘI GHI theo phiên (read-modify-write trực tiếp = mất dữ liệu)
- TopCV/ITviec chặn Cloudflare → tầng headless browser; host shared không có Chromium → LUÔN có ô dán JD tay
- Multer decode sai tên file UTF-8 (tiếng Việt) → `Buffer.from(name,'latin1').toString('utf8')`
- Session id khớp regex chặt TRƯỚC khi dùng làm đường dẫn (path traversal)
- Restart server giữa lúc xử lý → session kẹt "processing" → startup sweep
- LiteSpeed gắn cache 7 ngày cho HTML → `Cache-Control: no-cache` cho HTML
- Dev local: server cũ kẹt cổng → boot mới fail EADDRINUSE im lặng (output bị redirect) → kiểm tra `netstat`/taskkill trước khi kết luận "code lỗi"

**UI:**
- `.tabs` sticky (z-index 40) đè tooltip/overlay — element con có `transform` khi hover tạo
  stacking context giam `::after` → tăng z-index riêng lẻ VÔ ÍCH, phải bỏ transform
- Grid/flex gốc của class cũ có thể ghi đè layout mới (hero compact bị ép thành cột) → `display: block` tường minh
- Panel so sánh đọc nhầm vị trí field (`parentSessionId` nằm top-level session, không phải meta)

**Gmail compose:**
- `encodeURIComponent` bắt buộc (tiếng Việt có dấu, xuống dòng); nhiều email = dấu phẩy; BCC để ẩn danh; strip dòng đầu nếu trùng subject

## Test biên bắt buộc trước khi nộp

- [ ] File không phải CV → thông báo thân thiện, không crash
- [ ] Thiếu "vị trí nhắm tới" → chặn từ đầu, không tốn token AI
- [ ] JD link chết → phiên vẫn phân tích phần CV (thông báo rõ)
- [ ] Reload giữa chat/rewrite pending → không mất dữ liệu
- [ ] CV dạng ảnh chụp → OCR đúng (không phải hội thoại/NOT_DOCUMENT)
- [ ] Viết lại chế độ bổ sung → mục kỹ năng có ghi chú trung thực, không nhúng vào kinh nghiệm
- [ ] Gmail compose → thư đến đúng email, tiêu đề không lặp, tiếng Việt không lỗi font
- [ ] Nạp lại CV → panel so sánh hiện, không lỗi khi phiên gốc thiếu field mới
- [ ] Server restart → không có session kẹt spinner
