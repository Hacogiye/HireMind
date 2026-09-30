// lib/jd.js — TODO(ngày thi): tải nội dung tin tuyển dụng từ URL.
// Kế hoạch: nhiều tầng fallback (direct fetch → proxy reader → headless browser),
// url thuộc nhóm job boards lớn thì đảo thứ tự ưu tiên tầng browser lên đầu.
// Bắt buộc:
// - Guard SSRF: chỉ cho http/https, chặn localhost/IP nội bộ/metadata.
// - Playwright lazy-require trong hàm — host shared không có Chromium vẫn phải boot được.
// - Có đường thoát: fetch fail → dùng JD text user dán tay, không chết phiên.
module.exports = {};
