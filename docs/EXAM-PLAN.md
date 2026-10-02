# Kế hoạch ngày thi — HireMind (9 tiếng: 8 xây + 1 bàn luận)

## Quy định áp dụng (ngày thi)

1. Được chuẩn bị trước **khung code trắng** (Project Template, cài sẵn Database/Thư viện).
2. **Toàn bộ dòng code logic nghiệp vụ** phải được thực hiện và **commit trên GitHub trong thời gian thi**.

→ Template này đúng phạm vi được phép: khung + deps, không có logic.
→ Giám khảo đọc timeline commit để xác minh quá trình làm thật → **commit nhỏ, đều, liên tục**.

## Thời lượng thực tế

- Tổng **9 tiếng** theo BTC (có **3 tiếng chấm điểm**) → sau mốc ~6:00 phải **demo được end-to-end**.
- Kế hoạch nhóm: **8 tiếng xây dựng** (deadline cứng — hết giờ 8 mọi logic đã commit) +
  **1 tiếng cuối bàn luận với thành viên** (rehearse demo, chỉ fix nhỏ + commit ngay).

## Sản phẩm đích 8 tiếng (phạm vi chức năng)

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

## Trước ngày thi (checklist)

- [x] Template khung trắng `hiremind-template/` — deps cài sẵn, git init, không logic
- [x] Repo GitHub `https://github.com/Hacogiye/HireMind.git` — remote `origin` đã nối
- [ ] **Test AI endpoint cả TEXT và VISION**: điền `.env` → `npm start` → 1 call text + gửi 1 ảnh
      nhỏ hỏi "ảnh màu gì". Model không nhìn được ảnh → set `AI_VISION_MODEL` (đã có trong .env.example)
- [ ] Chuẩn bị dữ liệu demo: 1-2 CV (PDF + ảnh chụp) + 2-3 link JD (TopCV + site thường) + 1 file
      KHÔNG phải CV + 1 JD dán tay sẵn (phòng mạng)
- [ ] Xem lại bản tham chiếu v16 (`Downloads/HireMind`) — đặc biệt: 2 chế độ rewrite, chuẩn
      cover letter (letterhead/≤3 số/CTA), vòng kiểm chứng, hàng đợi ghi
- [ ] Rehearse demo 60 giây: upload → phân tích → **viết lại (2 chế độ) → xuất Word (ô ảnh) →
      nạp kiểm chứng → so sánh điểm → cover letter → Gmail** — đây là arc pitching
- [ ] Kiểm tra máy ngày thi: `git config user.name/user.email`, đăng nhập GitHub credential manager

## Mốc 8 giờ xây dựng (commit sau MỖI đơn vị)

| Giờ | Việc |
|---|---|
| 0:00–0:30 | Verify khung + health; khung server (headers, static, middleware session id, body limit) |
| 0:30–1:30 | Session + upload (multer, tên file UTF-8) + trả link; wizard client gửi file + meta |
| 1:30–3:00 | Trích xuất (pdf.js text + ảnh scan; DOCX/TXT server) + AI client (stream SSE, extractJson, OCR chống hội thoại, tách AI_VISION_MODEL, phân loại lỗi) |
| 3:00–4:15 | Pipeline nền: validate/gộp CV → JD → phân tích JSON schema đầy đủ (verdictLabel, alternativePaths) + stage progress + hàng đợi ghi + nhánh not-CV/thiếu vị trí |
| 4:15–4:45 | Fetch JD 3 tầng + SSRF guard + fallback dán tay |
| 4:45–6:00 | Dashboard: hero compact (3 stat chip bấm nhảy tab) + tabs Tổng quan/Đối chiếu/Lộ trình — **sau mốc này demo được end-to-end** |
| 6:00–6:50 | **Viết lại CV 2 chế độ** (mode cards + cảnh báo tham khảo) + **xuất CV thiết kế .docx** |
| 6:50–7:20 | Nạp CV kiểm chứng (phiên con + parentSessionId) + panel so sánh + Cover Letter + Gmail compose |
| 7:20–7:45 | Deploy host (Run NPM Install + env) + smoke test end-to-end THẬT |
| 7:45–8:00 | Buffer + commit/push cuối — **sau mốc này KHÔNG viết logic mới** |

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

## Giờ thứ 9 — bàn luận cuối với thành viên

- Rehearse demo arc: phân tích → **viết lại (2 chế độ) → xuất Word → nạp kiểm chứng → so sánh
  điểm → cover letter → Gmail** — nhấn mạnh thông điệp "AI trực tiếp sửa CV, không chỉ chấm"
- Rà checklist test biên, chụp màn hình dự phòng (phòng AI endpoint trục trặc)
- Dọn `docs/PROGRESS.md`, commit + push cuối
- Bug phát hiện: chỉ fix nhỏ, commit ngay — không thêm tính năng

## Bẫy đã biết (từ bản tham chiếu v16 — tránh lặp lại)

**AI / model:**
- Model alias có thể KHÔNG có vision (route vào model text) → OCR hỏng "không nhìn thấy ảnh" → tách `AI_VISION_MODEL`, test vision TRƯỚC ngày thi
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
