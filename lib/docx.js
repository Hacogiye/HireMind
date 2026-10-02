// lib/docx.js — TODO(ngày thi, SAU khi lõi chạy end-to-end): xuất .docx không dependency
// (zip OOXML tự viết bằng zlib).
// - buildDocx(title, markdown): markdown cơ bản (heading/bold/bullet/quote/rule) → Word.
// - buildCvDocx(markdown, {name}): CV THIẾT KẾ — parse markdown CV thành cấu trúc rồi emit:
//     banner màu sát lề trên; header 2 cột (trái: tên lớn + chức danh + khối liên hệ;
//     phải: Ô DÁN ẢNH 3×4 border nét đứt + hướng dẫn "Insert → Pictures" để user tự dán);
//     heading mục UPPERCASE màu + kẻ line; dòng công ty đậm + ngày tháng tab căn phải;
//     kỹ năng xếp 2 cột khi bullet ngắn; parse rỗng → fallback buildDocx thường.
// - ATS-friendly: 1 cột chính, font chuẩn (Calibri), kỹ năng dạng TEXT — KHÔNG thanh %
//   kỹ năng (ATS không đọc được, lại vô căn cứ).
// - Lưu ý: host KHÔNG cần LibreOffice — file sinh thuần Node; LibreOffice chỉ là tool
//   verify phía dev (convert ra PDF xem bằng mắt).
module.exports = {};
