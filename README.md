# HireMind — Khung trắng ngày thi

Template khởi điểm **hợp quy định**: chỉ có khung dự án + thư viện cài sẵn,
**KHÔNG chứa logic nghiệp vụ**. Toàn bộ logic phải được viết và commit lên GitHub
trong 12 giờ thi — kế hoạch chi tiết: [docs/EXAM-PLAN.md](docs/EXAM-PLAN.md).

## Chạy

```bash
npm start              # deps đã cài sẵn trong thư mục này
cp .env.example .env   # điền AI_BASE_URL / AI_API_KEY / AI_MODEL
# → http://localhost:3000  (route duy nhất có sẵn: GET /api/health)
```

## Cấu trúc

```
├── server.js        # Bootstrap Express + TODO danh sách routes
├── dotenv.js        # Loader .env không dependency (phần khung)
├── lib/             # Stub module nghiệp vụ — toàn TODO
│   ├── ai.js        # AI client OpenAI-compatible
│   ├── jd.js        # Tải tin tuyển dụng từ URL (multi-fallback)
│   ├── pipeline.js  # Pipeline nền: extract → validate → JD → analyze
│   ├── services.js  # Chat / Mock interview / Cover letter
│   └── docx.js      # Xuất Word (tính năng phụ)
├── public/          # Shell 2 trang (index + session) — chưa có UI
├── data/            # Mỗi phiên 1 thư mục (session.json + uploads/) — gitignore
└── docs/
    ├── EXAM-PLAN.md     # Kế hoạch 12 giờ + bẫy đã biết + checklist biên
    ├── ARCHITECTURE.md  # Viết trong ngày thi
    └── PROGRESS.md      # Log tiến độ trong ngày thi
```

## Quy ước ngày thi

- Commit GitHub **thường xuyên sau mỗi mốc** — yêu cầu quy định là mọi dòng logic
  phải nằm trên GitHub trong 12 giờ.
- Không commit `.env`, `data/`, `node_modules/` (`.gitignore` đã chặn).
