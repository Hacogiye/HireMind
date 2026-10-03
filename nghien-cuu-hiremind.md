# Báo cáo nghiên cứu dự án HireMind

> Nơi khảo sát: `C:\Users\Tu_DZ\Downloads\hiremind-template` — nhánh `main`, commit cuối `4a17e30` (2026-10-03 14:45).
> Phạm vi: **chỉ đọc** — không sửa file dự án, không chạy server. Mọi khẳng định kèm bằng chứng `file:line`.
> Ngày viết báo cáo: 2026-10-03.

---

## 1. Chủ đề & định vị sản phẩm

### 1.1. HireMind giải quyết vấn đề gì

HireMind là nền tảng web **phân tích CV đối chiếu với tin tuyển dụng (JD) thực tế**, định vị trong `package.json`: *"HireMind — CV vs Real Job Description intelligence platform"* (`package.json:4`). Trang đích tự giới thiệu: *"Đưa CV của bạn khớp chuẩn xác từng tin tuyển dụng thực tế"* (`public/index.html:6`).

Vấn đề cốt lõi được liệt kê ngay trên landing page dưới 4 "nỗi đau" của người tìm việc (`public/index.html:64-84`):
1. Nộp hàng chục CV không hồi âm, không ai nói bị loại ở khâu nào.
2. Đọc JD xong không rõ mình thiếu gì (đâu bắt buộc, đâu nên có).
3. Hồ sơ còn mỏng, không biết bổ sung kiến thức gì.
4. Áp lực phòng phỏng vấn, không có nơi luyện tập an toàn.

Giải pháp: một phiên phân tích duy nhất (không cần tài khoản) trả về **điểm CV 4 tiêu chí, điểm khớp ATS, xác suất trúng tuyển, lộ trình học bù đắp, hướng đi thay thế, phỏng vấn mô phỏng AI, chat coach, viết lại CV và thư ứng tuyển** — sản phẩm đích được chốt trong kế hoạch thi `docs/EXAM-PLAN.md:25-38`.

### 1.2. Đối tượng người dùng

- Người tìm việc tại **Việt Nam**: mọi prompt AI đều yêu cầu trả lời tiếng Việt và am hiểu thị trường VN (`lib/pipeline.js:249-250` — *"chuyên gia tuyển dụng IT/nhân sự dày dặn kinh nghiệm tại Việt Nam"*); landing nhắm cả *"Sinh viên mới ra trường, người chuyển ngành"* (`public/index.html:80`).
- Wizard cho chọn 5 mức kinh nghiệm: Sinh viên/mới ra trường → Trên 5 năm (`public/index.html:242-248`).
- Hệ thống gọi thẳng các job board Việt Nam: TopCV, ITviec, VietnamWorks, CareerBuilder VN, JobsGo, Glints (`lib/jd.js:208-209`).

### 1.3. Luồng sử dụng chính

1. Landing → wizard 3 bước: **(1) CV & thông tin** (vị trí nhắm tới *bắt buộc* + kinh nghiệm + file CV hoặc nhập tay), **(2) Tin tuyển dụng** (link hoặc dán tay hoặc bỏ qua), **(3) Xử lý** (`public/index.html:223-228`).
2. Bấm phân tích → `POST /api/session/new` tạo phiên, trả link riêng `/s/:id`; upload qua `POST /api/upload` rồi **rời trang tự do** — pipeline chạy nền trên server (`server.js:174-177`, `public/js/processing.js:75-80` — *"Bạn có thể thoát trang ngay — AI vẫn xử lý tiếp phía server"*).
3. Trang phiên `/s/:id` poll `GET /api/session/:id`, hiện progress 4 stage rồi dashboard 8 tab (`public/js/session.js:196-205`).
4. Vòng lặp cải thiện: Viết lại CV 2 chế độ → xuất Word → **nạp CV kiểm chứng** (`/reupload` tạo phiên con so sánh trước/sau) → cover letter → mở Gmail soạn sẵn (`docs/TESTING.md:36-43` — kịch bản demo 60 giây).

Bối cảnh hình thành: đây là **bài thi nhóm 9 tiếng** (7 giờ xây + 2 giờ bàn luận), khởi điểm từ "khung trắng" không logic, mọi logic phải commit trong giờ thi (`docs/EXAM-PLAN.md:3-8`). Sản phẩm hoàn chỉnh đến mốc ~7:10 theo log `docs/PROGRESS.md:35-47`.

---

## 2. Kiến trúc hệ thống

### 2.1. Sơ đồ mô tả bằng chữ

```
[Trình duyệt — public/]
  index.html (landing + wizard)           wizard.js: extractPdf bằng pdf.js local,
  session.html (trang phiên, shell rỗng)  poll status, gửi multipart + clientPdfText/Images
        │  fetch JSON/multipart
        ▼
[Server Express — server.js]  (Node ≥18, package.json:7-9)
  ├─ security headers + CSP               server.js:16-34
  ├─ static no-cache + GET /s/:id         server.js:36-44
  ├─ middleware session id (regex chặt)   server.js:47-59   ← chặn path traversal trước multer
  ├─ rate limit token bucket tự viết      server.js:62-78
  ├─ multer diskStorage data/<id>/uploads server.js:105-118
  └─ 18 API endpoints (mục 3)
        │
        ├─ setImmediate(processSession)   server.js:174-177  ← PIPELINE NỀN fire-and-forget
        │        ▼
        │  [lib/pipeline.js — orchestration 4 bước, pipeline.js:350-434]
        │    1. extracting  : extractContent — TXT/MD/DOCX(mammoth)/PDF(pdf-parse)/OCR(≤8 ảnh)  pipeline.js:97-170
        │    2. validating  : validateAndStructure — AI xác thực + gộp CV thành JSON            pipeline.js:172-202
        │    3. jd          : fetchJD 3 tầng (lib/jd.js) → structureJD trích JD thành JSON      pipeline.js:382-407, 204-228
        │    4. analyzing   : analyzeCV — chấm điểm/đối chiếu JSON schema lớn, temp 0.15        pipeline.js:230-347
        │    ── mọi bước ghi qua withSession (hàng đợi ghi theo phiên) + atomic write          pipeline.js:34-76
        │
        ├─ lib/ai.js — AI client OpenAI-compatible: SSE stream, extractJson, chatJson,
        │              ocrImage (AI_VISION_MODEL), phân loại lỗi thân thiện + noRetry          lib/ai.js:1-199
        ├─ lib/services.js — rewriteCV 2 chế độ, generateCoverLetter, chatTurn,
        │              interviewSystem + parseInterviewTurn (8 mood, marker kết thúc)           lib/services.js:1-291
        └─ lib/docx.js — Markdown→DOCX không dependency (zip OOXML tự viết qua zlib)
                       buildDocx + buildCvDocx (banner, ô ảnh 3×4)                              lib/docx.js:1-438
        │
        ▼
[AI provider]  POST {AI_BASE_URL}/chat/completions, stream:true, Bearer key
               .env: AI_BASE_URL / AI_API_KEY / AI_MODEL / AI_VISION_MODEL / PORT        .env.example:1-6

[Lưu trữ] data/<session-id-12-hex>/  (mỗi phiên 1 thư mục, gitignore)
             ├─ session.json — trạng thái + meta + files + cv + jd + result + chatHistory…
             └─ uploads/     — file gốc do multer ghi
```

Điểm mấu chốt kiến trúc: **server là stateless-API + file-store**; toàn bộ trạng thái sống trong `session.json` của từng phiên; client dashboard chỉ poll và render. Không có database — `data/` chính là "database" dạng cây thư mục (README.md:24 — *"Mỗi phiên 1 thư mục (session.json + uploads/)"*).

### 2.2. Vai trò từng module

**Backend**
- `server.js` (675 dòng) — bootstrap Express, security headers, CSP, static no-cache, middleware phiên, rate limit, multer, toàn bộ 18 API endpoints, error handler multer → JSON 413 thân thiện (`server.js:201-211`), startup sweep dọn phiên kẹt khi restart (`server.js:634-666`).
- `dotenv.js` (16 dòng) — loader `.env` không dependency, không override biến môi trường đã có (ưu tiên env của cPanel/Passenger) (`dotenv.js:1-16`).
- `lib/ai.js` (199 dòng) — client AI: `chat()` stream SSE chỉ ghép `delta.content` bỏ `reasoning_content` (`lib/ai.js:81-100`), timeout 120s (`lib/ai.js:17`), `extractJson` quét ngoặc cân bằng tôn trọng chuỗi (`lib/ai.js:113-146`), `chatJson` retry 1 lượt ép JSON (`lib/ai.js:149-162`), `ocrImage` dùng `AI_VISION_MODEL` + guard phản hồi hội thoại (`lib/ai.js:165-191`), `aiHttpError` phân loại 400/401/402/403/404/429 kèm cờ `noRetry` (`lib/ai.js:19-33`).
- `lib/jd.js` (199 dòng) — tải JD 3 tầng direct → proxy (r.jina.ai) → browser (Playwright lazy-require), SSRF guard `assertPublicUrl` chạy trước mọi tầng, fetch redirect MANUAL kiểm lại từng bước (`lib/jd.js:67-118, 137-233`).
- `lib/pipeline.js` (436 dòng) — session helpers (`sessionDir` chặn path traversal `pipeline.js:17-24`), `writeSession` atomic rename + fallback copy khi Windows EPERM (`pipeline.js:34-53`), **hàng đợi ghi `withSession`** chuỗi promise theo id (`pipeline.js:56-72`), `withRetry` tôn trọng `noRetry` (`pipeline.js:80-95`), `extractContent` trích xuất đa định dạng (`pipeline.js:97-170`), 3 hàm prompt AI (validate `:172`, structureJD `:204`, analyzeCV `:230`), `processSession` orchestration (`:350-434`).
- `lib/services.js` (291 dòng) — `cvContext` gom ngữ cảnh CV+JD+phân tích dùng chung mọi prompt (`services.js:8-34`), `rewriteCV` 2 chế độ reshape/addskills + phục hồi PII (`:36-122`), `generateCoverLetter` chuẩn letterhead/≤3 số liệu/CTA (`:125-156`), `chatTurn` coach kèm ảnh (`:158-190`), `interviewSystem` + `parseInterviewTurn` + bảng `MOODS` 8 trạng thái (`:193-289`).
- `lib/docx.js` (438 dòng) — writer `.docx` **không dependency**: crc32 + zip deflate qua `zlib` (`docx.js:13-77`), parser markdown con (heading/bold/italic/code/bullet/numbered/quote/hr, `docx.js:142-216`), `buildDocx` văn bản (`docx.js:231-249`), `parseCvMarkdown` (`docx.js:252-310`), `buildCvDocx` CV thiết kế: banner màu `4F46E5`, header 2 cột với ô ảnh 3×4 viền, heading mục màu + kẻ dòng, ngày căn phải, kỹ năng 2 cột (`docx.js:312-436`).

**Frontend (`public/`)**
- `index.html` (371 dòng) — landing: hero + 4 pain points + 3 bước + 6 feature cards + showcase 3 screenshot thật (`/img/shot-*.jpg`) + wizard 3 bước, dropzone kéo thả, form CV nhập tay 2 kiểu (điền form / tự viết).
- `session.html` (63 dòng) — shell trang phiên; nạp 5 script local: theme, effects, marked.min.js, processing.js, session.js (`session.html:57-61`).
- `js/wizard.js` (297 dòng) — điều khiển wizard; **pdf.js chạy trên trình duyệt**: `extractPdf` lấy text từng trang, trang mỏng (<80 ký tự) render thành ảnh JPEG scale 2× quality 0.82 gửi lên cho OCR (`wizard.js:162-196`); poll sau khi submit (`wizard.js:266-281`).
- `js/processing.js` (151 dòng) — UI xử lý dùng chung: orb animation, timer, 4 stage có nhãn + progress % (`processing.js:6-13`: queued 6% → extracting 26% → validating 50% → jd 70% → analyzing 90% → done 100%), link "rời trang an toàn".
- `js/session.js` (1755 dòng) — dashboard: sanitize markdown trước khi render (strip script/handler/`javascript:`, `session.js:16-24`), hero stat chip bấm nhảy tab, 8 tab, panel so sánh phiên kiểm chứng (`session.js:371-374`), chat UI, interview UI, cover letter + **mở Gmail compose** với `encodeURIComponent` (`session.js:1655-1656`).
- `js/theme.js` (37) — dark/light; `js/effects.js` (121) — reveal/aurora; `js/marked.min.js`, `js/pdf.min.js` + `pdf.worker.min.js` — thư viện third-party đặt **local** (không CDN, tôn trọng CSP `'self'`; PROGRESS.md:19 ghi rõ lý do offline + CSP).
- `css/base.css` (628) / `landing.css` (349) / `session.css` (798) — design tokens, dark mode, layout.

**Dữ liệu (`data/`)** — mỗi phiên một thư mục id 12-hex; thực tế đang có 6 thư mục (5 id thật + `test/`), chứng tỏ hệ thống đã chạy thật nhiều lần (kiểm tra bằng `ls data/`).

---

## 3. Danh sách API endpoints (18 API + 2 trang)

Đếm trực tiếp từ các lệnh `app.get/app.post` trong `server.js` (grep `app\.(get|post)\(` — 20 route, trừ 2 route trang).

| # | Method | Path | Chức năng | Request chính | Response chính | Vị trí |
|---|--------|------|-----------|----------------|----------------|--------|
| 0 | GET | `/` | Landing + wizard (static) | — | index.html | server.js:36 |
| 0b | GET | `/s/:id` | Trang phiên (SPA shell) | — | session.html | server.js:41-44 |
| 1 | POST | `/api/session/new` | Tạo phiên, trả link | — | `{id, url}` | server.js:84-101 |
| 2 | POST | `/api/upload` | Nhận file+meta, kick pipeline | multipart: files ≤12, meta (targetRole bắt buộc, experienceLevel, jdUrl, jdManual), clientPdfText, clientPdfImages | `{id, url}` | server.js:121-178 |
| 3 | GET | `/api/session/:id` | Poll trạng thái + dữ liệu dashboard | — | session.json public (đã bỏ clientPdfText/Images) | server.js:183-197 |
| 4 | POST | `/api/session/:id/rewrite` | Viết lại CV 2 chế độ | `{mode: "reshape"\|"addskills"}` | `{note, rewrittenCv, changes[], unfixableGaps[], mode}` | server.js:214-246 |
| 5 | POST | `/api/export/docx` | Xuất Word từ Markdown | `{title, markdown ≤60000}` | file .docx attachment | server.js:249-263 |
| 6 | POST | `/api/export/cv-docx` | Xuất CV thiết kế (banner, ô ảnh 3×4) | `{markdown, name}` | file .docx tên UTF-8 | server.js:265-283 |
| 7 | POST | `/api/session/:id/reupload` | Nạp CV kiểm chứng → **phiên con** kế thừa meta + `parentSessionId`, kick pipeline | multipart như upload | `{id, url}` | server.js:286-345 |
| 8 | POST | `/api/session/:id/cover-letter` | Tạo thư ứng tuyển; **cache theo option** | `{tone, language, extraNote}` | `{subject, letter, tips}` (+`cached:true` nếu trùng option) | server.js:347-380 |
| 9 | POST | `/api/session/:id/chat` | Chat Coach (persist history) | `{message, images? ≤3}` | `{reply, history[]}` | server.js:383-433 |
| 10 | POST | `/api/session/:id/interview/start` | Bắt đầu buổi phỏng vấn | `{prep?: bool}` (chế độ luyện từ câu hỏi khó) | `{question, ended, report, mood}` | server.js:436-451 |
| 11 | POST | `/api/session/:id/interview/reply` | Trả lời 1 lượt | `{message}` | như trên | server.js:453-466 |
| 12 | POST | `/api/session/:id/interview/stop` | Kết thúc + xuất báo cáo | — | `{question:'', ended, report}` | server.js:468-478 |
| 13 | GET | `/api/session/:id/interview/state` | Vào lại buổi đang dở / đã kết thúc | — | `{hasSession, ended, question, pending, ending, report, mood}` | server.js:480-501 |
| 14 | GET | `/api/session/:id/interview/transcript` | Transcript buổi hiện tại (mood từng lượt) | — | `{turns[]}` | server.js:503-523 |
| 15 | POST | `/api/session/:id/interview/archive` | Lưu buổi vào `interviewHistory[]`, reset | — | `{ok, historyCount}` | server.js:525-562 |
| 16 | GET | `/api/session/:id/interview/history` | Danh sách buổi đã lưu | — | `{history[{index, endedAt, score, verdict, turns}]}` | server.js:564-578 |
| 17 | GET | `/api/session/:id/interview/history/:index` | Chi tiết 1 buổi cũ | — | đối tượng buổi (report + transcript) | server.js:580-590 |
| 18 | GET | `/api/health` | Health check | — | `{ok:true, name:'hiremind', ts}` | server.js:627 |

Chính sách đi kèm: endpoint tốn AI đều bị rate limit token bucket — upload (10 token/6s), rewrite (20/3s), cover (30/3s), chat (60/3s), interview (90/3s) (`server.js:121, 214, 347, 383, 436-525`); vượt → 429 thông báo tiếng Việt (`server.js:73-76`). File ≤15MB × 12 file, form field ≤20MB (`server.js:113-116`); lỗi multer trả 413 JSON thân thiện (`server.js:201-211`).

---

## 4. Tính năng nổi bật (cách cài đặt thật, có bằng chứng)

### 4.1. Upload đa định dạng + nhập tay khi không có file
- Multer diskStorage vào `data/<id>/uploads`, tên file được sanitize + timestamp (`server.js:105-118`); **sửa lỗi UTF-8**: tên file tiếng Việt bị multer decode latin1 → đổi lại bằng `Buffer.from(name,'latin1').toString('utf8')` (`server.js:139`, `server.js:310`).
- Chấp nhận PDF/DOCX/TXT/MD/JPG/JPEG/PNG/WEBP/GIF/BMP (`public/index.html:264` — accept attr; `pipeline.js:118-152`).
- Không có file vẫn được: form CV hoặc tự viết, client gộp thành `clientPdfText`; server chỉ chặn khi cả file lẫn text đều rỗng (`server.js:130-133`; wizard `wizard.js:114-140`).

### 4.2. Đường ống PDF thông minh (client + server chia việc)
- pdf.js **3.11.174 đặt local** (thư mục `public/js/`, commit `2ef8749`) để tương thích CSP `'self'` và chạy offline (PROGRESS.md:19).
- `extractPdf`: mỗi trang lấy text; nếu trang <80 ký tự (scan) → render canvas scale 2 → JPEG 0.82 → base64 đưa vào `clientPdfImages` (`wizard.js:162-196`). Server chỉ OCR tối đa 8 ảnh (`pipeline.js:106-107`).
- Server-side dự phòng: nếu client không gửi text, `pdf-parse` lazy-require đọc PDF; DOCX qua `mammoth.extractRawText` (`pipeline.js:108-127`). Xóa `clientPdfText/Images` khỏi session sau khi dùng để tránh re-serialize vài MB base64 mỗi lần ghi (`pipeline.js:156-159`).

### 4.3. OCR ảnh CV (vision)
- `ocrImage` luôn dùng `AI_VISION_MODEL` (tách biến vì alias text có thể không có vision — `lib/ai.js:3-11`), yêu cầu trích Markdown và trả đúng chuỗi `[NOT_DOCUMENT]` nếu không phải tài liệu (`lib/ai.js:168-175`).
- **Guard phản hồi hội thoại**: nếu output <15 ký tự hoặc khớp pattern hội thoại ("I'll…", "Let me…"…) → ném lỗi để retry; bình luận trong code giải thích không dùng ngưỡng 60 ký tự cứng để tránh nuốt trang bìa ngắn (`lib/ai.js:177-187`).
- OCR chạy tuần tự từng ảnh để giảm áp lực API và báo warning theo từng trang (`pipeline.js:136-147`).

### 4.4. JD từ URL — 3 tầng dự phòng + đảo ưu tiên job board
- Tầng `direct` (fetch thẳng, chặn nếu nội dung <200 ký tự), `proxy` (dịch vụ reader `https://r.jina.ai/`), `browser` (Playwright Chromium headless, đợi 4s cho AJAX của TopCV — `lib/jd.js:137-206`).
- URL thuộc BIG_BOARDS (topcv.vn, itviec.com, vietnamworks.com, careerbuilder.vn, jobsgo.vn, glints.com) → **đảo tầng browser lên đầu** (`lib/jd.js:208-219`).
- `fetchJD` gom lỗi từng tầng, thất bại toàn bộ → lỗi thân thiện ("site có thể chặn truy cập tự động") (`lib/jd.js:221-233`).
- Pipeline vẫn sống khi link chết: fallback sang JD dán tay (`jdSource:'manual'` + `jdNotice`) hoặc tiếp tục **không JD** (`pipeline.js:382-398`); không có JD thì kết quả phân tích buộc `match=null, roadmap=null` để dashboard không hiện tab giả (`pipeline.js:325-328`).

### 4.5. Pipeline nền 4 bước + stage progress
- Kick bằng `setImmediate(processSession(id))` ngay sau khi res.json — fire-and-forget, user đóng tab vẫn chạy (`server.js:174-177`, `server.js:337-338`).
- 4 stage ghi vào session qua hàng đợi: `queued → extracting → validating → jd → analyzing → done` (`pipeline.js:360-426`); client `processing.js:6-13` map đúng nhãn + % tiến độ, có timer.
- Nhánh chặn sớm tiết kiệm token: thiếu `targetRole` → error `missingRole` ngay (`pipeline.js:354-362`); trích xuất rỗng → error kèm warnings (`pipeline.js:365-371`); không phải CV (AI validate `isCv:false`) → error `notCv` **trước khi** đốt token analyze (`pipeline.js:374-378`).

### 4.6. Phân tích JSON đa lớp (điểm, đối chiếu, lộ trình, hướng đi thay thế)
- `analyzeCV` (temp 0.15 để giảm variance — `pipeline.js:341`) trả schema gồm: `overallScore`, `breakdown` 4 tiêu chí (content/format/relevance/impact), `hireAssessment` (passProbability + **`verdictLabel` do AI tự đặt bằng tiếng Việt**), `summary`, `strengths/weaknesses` có `evidence` trích từ CV, `improvements` có priority, `atsRedFlags`, `hardQuestions`, `match` (matched có bằng chứng / missing có severity critical-important-nice / extraPoints), `roadmap` từng bước (skill/why/how/duration/priority), `alternativePaths` (role/fitScore/why/note) — chỉ khi điểm <45 hoặc khả năng đậu <25% (`pipeline.js:230-347`).
- **Chặt ở server, không tin AI**: cap số phần tử (strengths≤4, weaknesses≤4, improvements≤3, redFlags≤4, hardQuestions≤3, alternativePaths≤3, roadmap≤5, matched/missing≤5 — `pipeline.js:314-324`); fallback `hireAssessment` khi AI thiếu field, tính từ overallScore (`pipeline.js:336-351`).

### 4.7. Viết lại CV 2 chế độ (điểm nhấn sản phẩm)
- `reshape`: cấu trúc lại + diễn lại mạnh hơn theo công thức **X-Y-Z** (đạt X, đo bằng Y, nhờ Z) chỉ dùng số liệu có thật, cắt sáo rỗng, nhấn từ khóa khớp JD (`services.js:69-71`); kỹ năng còn thiếu liệt vào `unfixableGaps` (`services.js:86-88`).
- `addskills`: bối cảnh "đã hoàn thành lộ trình học" → đưa kỹ năng thiếu vào mục `## KỸ NĂNG` gom nhóm (ngôn ngữ & framework / CSDL / devops-tools), cấm ghi "(đang học)", cấm heading "ĐANG BỔ SUNG", cấm bịa kinh nghiệm/công ty/dự án; `unfixableGaps` ép rỗng (`services.js:73-85`). Server chốt hạ: ép heading chuẩn + xoá gap (`services.js:120-124`).
- **Phục hồi PII bị AI che**: AI có thói quen thay email/SDT bằng placeholder dù bị cấm — server regex lấy email/phone thật từ CV gốc và thay ngược lại placeholder `[...email...]` (`services.js:104-118`).
- Timeout riêng 180s vì call này hay vượt 120s mặc định (`services.js:101-102`); pending state `rewritePending` persist để reload không mất (`server.js:219-223`).

### 4.8. Vòng kiểm chứng (nạp CV → so sánh trước/sau)
- `POST /reupload` tạo **phiên con id mới**, kế thừa `meta` cha + gắn `parentSessionId`, kick lại pipeline đầy đủ (`server.js:286-345`). Dashboard phiên con đọc `parentSessionId` top-level để tải kết quả cha dựng panel so sánh điểm (`session.js:371-374`).
- Bug thật đã fix: multer ghi nhầm vào thư mục phiên cha vì `req.sessionId` đặt sau multer → tách chain validate → multer → ghi (`server.js:288-308` + PROGRESS.md:41).

### 4.9. Cover Letter + Gmail
- Chuẩn bắt buộc trong prompt: letterhead 1 dòng, lời chào cá nhân hóa theo tên công ty, thân thư 250–350 từ, 2–3 bullet X-Y-Z nhưng "viết trôi chảy như người thật", **tối đa 3 con số**, câu "vì sao chọn công ty", nguyên tắc bán giải pháp, CTA tự tin đề xuất buổi trao đổi, subject không trùng câu trong thư, kèm 2–3 tips (`services.js:129-152`).
- Cache: cùng tone/language/extraNote → trả kết quả cũ `cached:true`, không đốt AI call (`server.js:353-359`).
- Gmail compose: mở `https://mail.google.com/mail/?view=cm` với `su`/`body` qua `encodeURIComponent` (tiếng Việt có dấu + xuống dòng), body chuyển Markdown → plain text (`session.js:1650-1656`, `session.js:28-35`).

### 4.10. Chat Coach
- System prompt gắn ngữ cảnh `cvContext` (CV sạch + JD + điểm + yếu + lộ trình + hướng đi khác), trả lời Markdown ≤350 từ, trích vị trí cụ thể trong CV, ưu tiên lộ trình đã phân tích (`services.js:8-34, 158-181`).
- Gửi kèm ảnh (≤3 ảnh, mỗi ảnh <4MB — `server.js:389-392`) → tự chuyển sang `AI_VISION_MODEL` (`services.js:184-190`).
- Persist: lượt user ghi NGAY vào `chatHistory` (≤12 lượt gần nhất) trước khi gọi AI — rời tab giữa câu trả lời không mất; AI lỗi → gỡ tin mồ côi + clear pending để history không lệch vai trò (`server.js:396-421`).

### 4.11. Mock Interview (phỏng vấn mô phỏng với tâm lý người thật)
- AI đóng hiring manager của đúng vị trí trong JD, hỏi bám CV, xen kẽ 70% kỹ thuật / 30% tình huống, dùng `hardQuestions` từ báo cáo làm cảm hứng (`services.js:204-225`).
- **8 mood** AI tự phát `===MOOD:xxx===`: warm/neutral/skeptical/annoyed/silence/stress/impressed/ending — mỗi mood có label, emoji, màu và **tip ứng biến cho ứng viên** (`services.js:193-202`); parser gỡ marker và khử khỏi câu hỏi (`services.js:279-287`).
- Kết thúc bằng marker `===INTERVIEW_END===` + JSON báo cáo: `overallScore`, `verdict`, `interviewerFeeling` (emoji/mood/attitude), **`bluntVerdict`** "nghĩ gì nói đấy", `questionFeedback` từng câu, `advice`, `alternativePathsNote` (`services.js:230-261`); báo cáo bị cắt → retry ĐÚNG 1 lượt chỉ để lấy báo cáo (`server.js:596-602`).
- State in-memory Map phản chiếu từ session.json nên reload giữa buổi không mất (`server.js:415-423, 453-461`); archive lưu `interviewHistory[]` kèm transcript + mood từng lượt (`server.js:525-562`).

### 4.12. Xuất Word + CV thiết kế
- `buildDocx`: zip OOXML tự viết (crc32 + deflate level 9 qua `zlib`, `docx.js:13-77`) — không thêm dependency nào; bullet dùng ký tự "• " thay numbering.xml để giảm rủi ro file hỏng (bình luận `docx.js:5-8`).
- `buildCvDocx`: banner màu accent `4F46E5`, header 2 cột với **ô dán ảnh 3×4 viền** (PHOTO_BORDERS `docx.js:336-342`), khối liên hệ, heading mục màu + kẻ dòng, ngày căn phải bằng tabs, kỹ năng 2 cột (bảng không viền); parse rỗng thì fallback `buildDocx` (`docx.js:353-356`).
- Tên file UTF-8 chuẩn RFC 5987: `filename*=UTF-8''CV-...` (`server.js:275-276`).

---

## 5. Điểm khác biệt / đột phá / giải quyết rủi ro

1. **SSRF guard nhiều lớp** (`lib/jd.js:67-118`) — vì URL JD do user cung cấp: chặn scheme lạ; IPv4 private mọi cách viết (dotted, **decimal**, **hex** — `normalizeIpv4` `jd.js:13-21`); IPv6 (::1, fe80, fc/fd unique-local, IPv4-mapped `::ffff:127.0.0.1`); hostname nội bộ (localhost/metadata/instance-data/*.local/*.internal — đúng mục tiêu tấn công metadata cloud); **DNS resolve kiểm tất cả A/AAAA** chặn DNS rebinding; **redirect manual** — fetch `redirect:'follow'` mặc định cho phép public URL 302 về 127.0.0.1 mà không kiểm lại, ở đây mỗi hop kiểm SSRF lần nữa, giới hạn 3 hops (`jd.js:102-118`). Guard áp dụng cho cả tầng direct, proxy và browser. Đây là điểm kỹ thuật bảo mật hiếm thấy ở mức bài thi.
2. **Hàng đợi ghi session.json chống race** (`pipeline.js:56-72`) — pipeline + chat + rewrite + cover letter ghi cùng file; read-modify-write trực tiếp sẽ mất dữ liệu. Giải pháp: Map id → chuỗi promise (mỗi mutation đọc mới nhất bên trong, ghi xong mới nhả); kèm **atomic write** (ghi .tmp rồi rename, `pipeline.js:34-53`) + retry/fallback copy khi Windows EPERM (bug thật đã gặp — PROGRESS.md:41). Trade-off được ghi chú: mutator không được nest `withSession` cùng id (tự chờ chính mình).
3. **Phân loại lỗi AI + kỷ luật retry** (`ai.js:19-33`, `pipeline.js:80-95`) — mỗi mã HTTP có thông báo tiếng Việt thân thiện cho UI; cờ `noRetry` cho 4xx (trừ 429) để không đốt tiền/thời gian retry vô ích; 429 và 5xx được retry backoff tuyến tính.
4. **Streaming SSE + chống reasoning_content** (`ai.js:35-110`) — stream giữ connection sống qua proxy ~100s (Cloudflare cắt response dài không stream); parser **chỉ ghép `delta.content`**, tuyệt đối không ghép `reasoning_content` (bẫy thật từ test trước ngày thi — EXAM-PLAN.md:89-91); xử lý cả endpoint trả JSON thuần lẫn gắn tail `data: [DONE]`; cap 2MB chống trôi; HTTP 200 content rỗng vẫn coi là lỗi retryable (`ai.js:107-111`).
5. **Chống JSON lỗi của AI** — `extractJson` quét **ngoặc cân bằng tôn trọng chuỗi/escape** thay vì regex thô, chịu được markdown fence + prose quanh JSON (`ai.js:113-146`); `chatJson` retry 1 lượt ép "CHỈ JSON" (`ai.js:149-162`); schema lớn bị **cap kích thước ở server** và ép null đúng chỗ (`pipeline.js:314-333`); fallback tổng thể khi thiếu hireAssessment (`pipeline.js:336-351`); validate kết quả từng bước (isCv boolean, mustHave array, overallScore number) trước khi dùng.
6. **OCR + tách AI_VISION_MODEL** (`ai.js:3-11, 165-191`) — biến môi trường riêng cho vision vì "model alias có thể KHÔNG có vision"; guard hội thoại + `[NOT_DOCUMENT]`; test vision bắt buộc trước ngày thi (EXAM-PLAN.md:56-58, đã PASS 2026-10-03).
7. **Chống path traversal** — session id bắt regex chặt `^[a-f0-9]{12}$` trước khi dùng làm đường dẫn, kiểm ở middleware (`server.js:47-59`), ở API (`server.js:185`), và lần nữa trong `sessionDir` (`pipeline.js:17-24`); tên file upload sanitize (`server.js:112-115`).
8. **Bảo mật mặc định (helmet-lite tự viết)** — nosniff, DENY iframe, Referrer-Policy, **CSP** `'self'` + img data:/blob: + Google Fonts + `frame-ancestors 'none'` (`server.js:16-34`); static `Cache-Control: no-cache` chống cache 7 ngày của LiteSpeed (`server.js:36-39`); rate limit token bucket tự viết per-IP per-endpoint (`server.js:62-78`); `x-powered-by` tắt (`server.js:12`); body limit 60MB chỉ để chứa ảnh base64 scan (`server.js:13`).
9. **Startup sweep chống session kẹt** (`server.js:634-666`) — restart giữa lúc xử lý → mọi phiên `processing` đánh dấu error với thông báo rõ, clear MỌI pending flag (chat/rewrite/cover/interview) → không spinner vĩnh viễn.
10. **Đa tầng dự phòng JD + dán tay** (mục 4.4) — bài học "host shared không có Chromium" được giải bằng lazy-require: tầng browser **tự khai tử** mà app vẫn boot (`jd.js:174-183`); luôn còn ô dán JD tay (EXAM-PLAN.md:105).
11. **Phục hồi PII sau rewrite** (mục 4.7) — deterministic phía server, không dựa vào model (`services.js:104-118`); bug "AI che email" là bẫy đã biết từ bản tham chiếu (EXAM-PLAN.md:94).
12. **Client-side PDF với OCR fallback** — chia việc browser (pdf.js text + render ảnh scan) / server (mammoth, pdf-parse, OCR) giúp giảm upload và tận dụng rendering engine trình duyệt (`wizard.js:162-196`, `pipeline.js:97-170`); fix fieldSize 20MB vì busboy mặc định 1MB làm chết 500 im lặng (`server.js:113-116` + PROGRESS.md:16).
13. **Bảo mật render markdown client** — strip `<script>`, event handler `on*`, `javascript:` trước khi parse (`session.js:16-24`).
14. **Resilience UI/UX**: poll giữ đồng hồ + stage %; tab interview tắt vẫn thông báo lịch sự thay vì lỗi (`session.js:332-334`); hero chip bấm nhảy tab; version query `?v=` thủ công cho static.

---

## 6. Số liệu dùng cho slide (số đếm thật — nguồn từng con số)

### 6.1. Dòng code (PowerShell `(Get-Content file).Count`, chạy 2026-10-03)

| File | LOC | | File | LOC |
|---|---|---|---|---|
| server.js | 675 | | public/js/session.js | **1.755** |
| dotenv.js | 16 | | public/js/wizard.js | 297 |
| lib/ai.js | 199 | | public/js/processing.js | 151 |
| lib/jd.js | 199 | | public/js/theme.js | 37 |
| lib/pipeline.js | 436 | | public/js/effects.js | 121 |
| lib/services.js | 291 | | public/index.html | 371 |
| lib/docx.js | 438 | | public/session.html | 63 |
| **Cộng backend JS** | **2.254** | | public/css/base.css | 628 |
| **Cộng lib/* (logic nghiệp vụ)** | **1.563** | | public/css/landing.css | 349 |
| | | | public/css/session.css | 798 |

- Tổng 24 file chính (code + docs + cấu hình): **7.166 dòng**; tách docs (EXAM-PLAN 175 + ARCHITECTURE 15 + PROGRESS 30 + TESTING 52 + README 38 + .env.example 9 + package.json 23 = 342) → **~6.824 dòng code/tài nguyên**.
- Frontend JS (5 file tự viết): 2.361 dòng; CSS: 1.775 dòng; HTML: 434 dòng.
- File lớn nhất: `public/js/session.js` (1.755 dòng) — dashboard 8 tab.

### 6.2. Các con số khác

| Chỉ số | Giá trị | Nguồn |
|---|---|---|
| Số commit git | **83** | `git log --oneline` (đếm Measure-Object) |
| Thời gian phát triển | 2026-09-30 21:32 (commit khung trắng `2f1b38d`) → 2026-10-03 14:45 (commit cuối `4a17e30`); **80/83 commit trong đúng ngày thi 2026-10-03** | `git log --format="%ad"` group theo ngày |
| API endpoints | **18** (+2 route trang `/` và `/s/:id`) | grep `app.(get|post)(` server.js |
| Endpoint cần rate limit | 5 nhóm bucket (upload/rewrite/cover/chat/interview) | server.js:121,214,347,383,436 |
| Module nghiệp vụ lib/* | 5 file / 30 hàm export (ai 4, jd 3, pipeline 13, services 7, docx 3) | grep `module.exports` mỗi file |
| Runtime dependencies | **4** (express ^4.21.2, mammoth ^1.9.0, multer ^1.4.5-lts.1, pdf-parse ^1.1.1) + 1 devDep (playwright ^1.49.0) | package.json:11-19 |
| Server-rendered library | pdf.js 3.11.174 (local, không CDN) + marked.min.js | public/js/, PROGRESS.md:19 |
| Tab dashboard | **8** (Tổng quan, Đối chiếu JD, Lộ trình, Viết lại CV, Chat Coach, Phỏng vấn giả lập, Cover Letter, CV gốc) | session.js:196-205 |
| Trạng thái mood phỏng vấn | **8** (warm, neutral, skeptical, annoyed, silence, stress, impressed, ending) | services.js:193-202 |
| Tầng tải JD | 3 (direct/proxy/browser) + đảo ưu tiên cho 6 job board lớn | jd.js:137-219 |
| Giới hạn upload | 15MB/file, 12 file/lần, field 20MB | server.js:113-116 |
| Giới hạn AI | CV 14.000 ký tự, JD 9.000 ký tự, JD fetch 60.000 ký tự, chat history ≤12, ảnh chat ≤3, OCR ≤8 trang, timeout chat 120s / rewrite 180s | pipeline.js:13-14; jd.js:11; server.js:396-398, 389-392; pipeline.js:106-107; ai.js:17; services.js:101-102 |
| Temperature phân tích | 0.15 (giảm variance điểm) | pipeline.js:341 |
| Checklist test biên | 12 ca (TESTING.md) + 9 ca trong EXAM-PLAN | docs/TESTING.md:18-32 |
| Thư mục phiên thật trong data/ | 6 (5 phiên id 12-hex + `test/`) | `ls data/` |
| Node yêu cầu | ≥18 | package.json:8 |

Câu chuyện slide nổi bật: **"7 tiếng, 83 commit, 18 API, 6.824 dòng code, 0 đồng dependency thừa — xuất Word bằng OOXML tự viết chỉ với zlib có sẵn của Node."**

---

## 7. Trạng thái hiện tại

### 7.1. Đã hoàn chỉnh (chạy được end-to-end)
- Toàn bộ chuỗi giá trị: tạo phiên → upload → pipeline 4 bước → dashboard 8 tab → rewrite → xuất docx → kiểm chứng → cover letter → Gmail → chat → interview. Git log cho thấy từng tính năng có commit `feat:` riêng và nhiều commit `fix:` từ test thật (ví dụ `5aaa239` lỗi vị trí error middleware, `1f4c798` nâng fieldSize, `4c1ee88` EPERM Windows, `00ef082` gỡ tin nhắn mồ côi, `0527461` ép heading "BỐ SUNG" + timeout 180s) — dấu hiệu code đã chạy và được sửa trên lỗi thật, không phải stub.
- `docs/PROGRESS.md` ghi log mốc tới ~7:10 với kết quả test thật (VD: "phiên con READY 80s so sánh score 15 vs cha 18" — PROGRESS.md:42).
- `data/` có 5 phiên id thật + 1 thư mục `test/` — hệ thống đã vận hành.

### 7.2. Còn TODO / stale (bằng chứng grep `TODO` toàn repo)
1. **`docs/ARCHITECTURE.md` — TODO thật duy nhất còn lại**: cả 3 mục "Tổng quan / Luồng dữ liệu / Bảo mật" đều là chữ `TODO` trống (`docs/ARCHITECTURE.md:7,11,15`). Báo cáo này (mục 2) có thể dùng để điền lại.
2. `lib/services.js:3` — comment `TODO(mốc sau): generateCoverLetter…` là **stale**: 3 hàm được nhắc đến đều đã tồn tại trong cùng file (`services.js:125, 158, 204`). Chỉ là comment đầu file chưa được dọn.
3. `server.js:29-32` và `server.js:629-643` — các dòng `TODO(ngày thi)` là **comment kế hoạch từ giai đoạn template**; chức năng tương ứng đã hiện thực (static ở `server.js:36`, `/s/:id` ở `:41`, rate limit ở `:62`, toàn bộ routes liệt kê trong TODO đã có thật ở trên). Nên xoá để tránh gây hiểu nhầm người chấm.
4. `README.md` mô tả dự án là "khung trắng… KHÔNG chứa logic nghiệp vụ", "lib/ Stub module — toàn TODO", "public/ chưa có UI" (README.md:3-25) — **hoàn toàn stale** so với thực tế; cần viết lại trước khi trình bày.
5. `docs/TESTING.md` — 12 ca test biên và 6 mục dữ liệu demo đều **chưa tick** (toàn bộ ô `☐`, TESTING.md:13-32); kịch bản demo 60 giây đã có sẵn nhưng chưa ghi kết quả chạy.
6. Không có unit test tự động trong repo (không thấy thư mục test/ của dự án; chỉ có `data/test/` là dữ liệu phiên) — QA dựa vào checklist thủ công + test biên trong PROGRESS.
7. `dotenv.js` không hỗ trợ value chứa ký tự `=` trong ngoặc kép nhiều tầng hay giá trị có `#` inline (regex đơn giản `dotenv.js:10-12`) — chấp nhận được cho phạm vi hiện tại.

### 7.3. Rủi ro vận hành còn mở (quan sát, không phải TODO trong code)
- Session id in-memory của interview (Map `server.js:415`) sống cùng process; sau restart đã có sweep nhưng **buổi đang dở sẽ mất transcript live** (đọc lại được từ `interviewMessages` persist — chấp nhận được).
- `data/` không có giới hạn dung lượng/dọn dẹp tự động — chạy lâu sẽ phình (mỗi phiên giữ uploads + session.json).
- Rate limit bucket per-IP lưu trong Map không có TTL dọn (`server.js:63`) — rò rỉ bộ nhớ chậm trên lưu lượng lớn.

---

## 8. Thuật ngữ & khái niệm cần giảng giải khi thuyết trình

- **Pipeline nền (background job)**: công việc chạy trên server sau khi đã trả response cho người dùng (`setImmediate` — `server.js:174-177`). Giá trị: user đóng tab/mất mạng vẫn nhận kết quả qua link phiên; server giải phóng request nhanh. So sánh dễ hiểu: "gửi đồ vào tiệm rồi về — tiệm làm xong giữ đồ cho mình quay lại".
- **Hàng đợi ghi (write queue)**: chuỗi promise per-session bảo đảm các luồng (pipeline/chat/rewrite…) không ghi đè lẫn nhau lên `session.json` (`pipeline.js:56-72`). Kỹ thuật nền: mọi mutation là job nối đuôi promise trước đó, đọc file mới nhất rồi mới ghi.
- **Atomic write**: ghi file tạm rồi `rename` — người xem không bao giờ thấy nửa file; kèm fallback cho lỗi EPERM của Windows (`pipeline.js:34-53`).
- **SSRF (Server-Side Request Forgery)**: kẻ xấu đưa URL nội bộ (127.0.0.1, 169.254.169.254 metadata cloud…) để **server của bạn** truy cập hộ. HireMind chặn bằng: kiểm IP private mọi dạng viết, hostname nội bộ, **DNS rebinding** (domain công khai trỏ IP nội bộ), và **redirect manual** (public URL 302 về nội bộ vẫn bị chặn — `jd.js:67-118`).
- **OCR flow**: ảnh scan → (client render PDF page sang JPEG qua canvas) → gửi base64 → server gọi model vision (`AI_VISION_MODEL`) trích Markdown → guard chống "trả lời hội thoại" → retry ≤3 → gộp vào CV (`wizard.js:162-196`, `ai.js:165-191`, `pipeline.js:136-147`).
- **SSE (Server-Sent Events) streaming**: AI trả từng mảnh `data: {…}` thay vì gom cả câu; parser ghép `delta.content`, bỏ `reasoning_content` (phần "suy nghĩ nội bộ" của model) — ghép nhầm sẽ dính chữ suy luận vào kết quả OCR/JSON (`ai.js:81-100`). Mục đích thực: giữ connection không bị proxy cắt khi phân tích dài vài phút.
- **Temperature 0.15**: tham số "độ sáng tạo" của model — chấm điểm cần ổn định nên hạ thấp để giảm variance (cùng CV chấm hai lần chênh nhau ít) (`pipeline.js:341`; bẫy variance trong EXAM-PLAN.md:95).
- **Token bucket rate limit**: mỗi IP có "xô" token nạp dần theo thời gian; mỗi request lấy 1 token, hết xô → 429 (`server.js:62-78`).
- **Path traversal**: thủ thuật `../` thoát thư mục qua tham số đường dẫn; chặn bằng regex id chặt trước khi ghép path (`server.js:47-59`).
- **CSP (Content-Security-Policy)**: header cho trình duyệt biết script/style/ảnh được nạp từ đâu — chặn XSS nạp script ngoài; lý do pdf.js phải đặt local (`server.js:22-33`, PROGRESS.md:19).
- **Công thức X-Y-Z**: viết bullet thành tích "đạt X, đo lường bằng Y, nhờ làm Z" — chuẩn resume hiện đại, được nhét vào prompt rewrite và cover letter (`services.js:71`, `services.js:141`).
- **ATS (Applicant Tracking System)**: phần mềm lọc CV của HR; "red flags ATS" là những gì khiến CV bị loại máy trước khi người đọc (`pipeline.js:299-300`).
- **Lazy-require**: chỉ `require()` khi thật sự dùng — Chromium/Playwright hay pdf-parse không cài vẫn để app boot được, tính năng tương ứng tự tắt (`jd.js:174-183`, `pipeline.js:113-114`, `server.js:251-252`).
- **OOXML**: định dạng file .docx thực chất là zip chứa XML; HireMind tự nén zip bằng `zlib` và sinh XML các paragraph/run — "viết Word không cần thư viện Word" (`docx.js:5-9, 13-77`).
- **DNS rebinding**: domain công khai đổi DNS trỏ về IP nội bộ giữa 2 lần kiểm; chống bằng resolve DNS và kiểm **tất cả** địa chỉ trả về (`jd.js:89-98`).
- **Vòng kiểm chứng (analyze → rewrite → re-upload → compare)**: vòng lặp "sửa xong chấm lại" tạo phiên con so phiên cha — cách chứng minh rewrite thật sự cải thiện điểm, không tự sướng (EXAM-PLAN.md:35-37, `server.js:286-345`).
- **Marker protocol với AI**: thay vì tin format tự do, buộc AI gắn marker máy đọc được (`===MOOD:xxx===`, `===INTERVIEW_END===`, `[NOT_DOCUMENT]`) rồi parse/gỡ trong code — giao thức ổn định giữa prompt và UI (`services.js:227-287`).

---

## Phụ lục A — Phương pháp & bằng chứng

- Đọc trực tiếp: README.md, docs/EXAM-PLAN.md, docs/ARCHITECTURE.md, docs/PROGRESS.md, docs/TESTING.md, server.js (toàn bộ 675 dòng qua 3 lần đọc), dotenv.js, .env.example, package.json, lib/ai.js, lib/jd.js, lib/pipeline.js (phần đầu + hàm chính), lib/services.js (đầy đủ các hàm chính), lib/docx.js (đầu + cấu trúc hàm), public/index.html, public/session.html, public/js/wizard.js (phần pdf.js), public/js/processing.js (đầu), public/js/session.js (đầu + tabs + so sánh + Gmail).
- Lệnh chạy: `git log --oneline` (83 dòng), `git log --reverse/-1 --format` (mốc thời gian), `git log --format="%ad"` group theo ngày (80 commit ngày 03-10), `(Get-Content file).Count` cho 24 file, `ls` cho lib/, public/, public/js, public/css, public/img, data/.
- Grep định danh: `app.(get|post)(`, `TODO`, `function `, `module.exports`, `mail.google.com|parentSessionId|data-tab`, `pdfjsLib|getDocument|toDataURL`.
- Điểm không truy cập được: `.env` (đọc được cấu trúc qua `.env.example`; giá trị key không dùng cho báo cáo), nội dung file trong `node_modules/`, `pdf.min.js`/`marked.min.js` (third-party minified — chỉ ghi nhận sự tồn tại và phiên bản pdf.js từ PROGRESS.md:19).

## Phụ lục B — Mâu thuẫn nguồn đã phát hiện (ghi rõ, không tự "hòa giải")

1. **README/ARCHITECTURE mô tả "khung trắng, toàn stub"** (README.md:3-25; ARCHITECTURE.md:3) **vs git log + mã nguồn hiện thực đầy đủ**: tài liệu viết cho *trước* ngày thi và chưa được cập nhật sau đó; bằng chứng mức cao hơn là lịch sử 83 commit + hàm thật trong mọi lib. Trạng thái đúng: **đã hoàn thành**, tài liệu mô tả stale.
2. **EXAM-PLAN.md:66-68 nói "Mock Interview, Chat Coach… không xây (cắt mặc định)"** **vs PROGRESS.md:43 ghi đã xây ở 6:30–6:45 + routes tồn tại** (`server.js:383-590`): nhóm đã vượt phạm vi tối thiểu khi còn thời gian — khi thuyết trình nên nói rõ đây là phần "thêm khi dư giờ" so với kế hoạch gốc.
3. **services.js:3 "TODO mốc sau"** vs chính file đó đã chứa 3 hàm được nhắc — stale comment, xem mục 7.2.
