# HireMind — Testing & Demo (Thiện phụ trách)

> File này do **Đinh Hoàng Thiện** sở hữu và commit. Cập nhật kết quả test thật vào bảng
> sau mỗi lần chạy. Kịch bản demo ở cuối file.

## 1. Dữ liệu demo (chuẩn bị TRƯỚC giờ thi)

| # | Dữ liệu | Mục đích | Sẵn sàng? |
|---|---|---|---|
| 1 | 1 CV thật dạng PDF (đúng ngành) | demo chính | ☐ |
| 2 | 1 CV dạng ẢNH CHỤP (chụp CV giấy) | demo OCR | ☐ |
| 3 | 1 CV DOCX | test đa định dạng | ☐ |
| 4 | 2–3 link JD: 1 TopCV + 1 site thường | demo fetch JD 3 tầng | ☐ |
| 5 | 1 file KHÔNG phải CV (ghi chú/GDkw) | test nhánh not-CV | ☐ |
| 6 | 1 JD dán tay sẵn (Notepad) | phòng mạng chết / TopCV chặn | ☐ |

## 2. Checklist test biên (chạy sau khi dashboard xong — ghi kết quả cột KQ)

| # | Test | Bước | Kết quả mong đợi | KQ |
|---|---|---|---|---|
| 1 | File không phải CV | upload ghi chú nấu ăn | thông báo thân thiện, không crash | ☐ |
| 2 | Thiếu vị trí nhắm tới | bỏ trống ô vị trí, submit | chặn từ đầu, không tốn token | ☐ |
| 3 | JD link chết | dán link không tồn tại | phiên vẫn ready (dùng JD tay hoặc bỏ JD) | ☐ |
| 4 | TopCV chặn | dán link TopCV | tầng browser của JD fetch xử lý / fallback tay | ☐ |
| 5 | CV ảnh chụp | upload ảnh CV | OCR ra text đúng, không phải hội thoại | ☐ |
| 6 | Reload giữa processing | F5 khi đang chạy | processing panel mount lại, không spinner chết | ☐ |
| 7 | Server restart giữa processing | restart rồi mở phiên | phiên báo lỗi thân thiện (không kẹt) | ☐ |
| 8 | Phiên không JD | upload không dán JD | chỉ tab Tổng quan, không chip ATS | ☐ |
| 9 | Tên file tiếng Việt | upload `CV_Nguyễn_Văn_A.pdf` | tên hiển thị không lỗi font | ☐ |
| 10 | File 16MB | upload file quá lớn | lỗi 413 thân thiện "File vượt quá 15MB" | ☐ |
| 11 | Dark mode | bật/tắt 🌙 | mọi panel đều đổi màu sạch | ☐ |
| 12 | Mobile | thu hẹp cửa sổ | hero 3 chip xuống hàng, không vỡ layout | ☐ |

## 3. Kịch bản demo 60 giây (arc pitching — nhóm trưởng trình bày)

> Thông điệp xuyên suốt: **"AI không chỉ chấm CV — AI trực tiếp sửa CV."**

1. **0–10s**: Nạp CV PDF + dán link JD → "AI bóc tách từng yêu cầu của nhà tuyển dụng."
2. **10–25s**: Dashboard hiện — chỉ vào 3 stat chip: *Điểm CV → Khớp ATS → Khả năng đậu*,
   mỗi chip bấm nhảy tab. Nhấn mạnh: **mọi nhận định đều có bằng chứng trích từ CV**.
3. **25–40s**: Tab Lộ trình — skill gap có từng bước học + thời gian. Tab Đối chiếu —
   đáp ứng/thiếu từng requirement, severity rõ ràng.
4. **40–55s**: Viết lại CV 2 chế độ → xuất Word (ô dán ảnh 3×4) → nạp kiểm chứng →
   so sánh điểm trước/sau.
5. **55–60s**: Cover letter + mở Gmail soạn sẵn. Chốt: "Từ CV thô đến hồ sơ ứng tuyển
   hoàn chỉnh — trong một phiên."

## 4. Phòng hờ

- Chụp màn hình dashboard + rewrite + cover letter TRƯỚC giờ thi (phòng AI endpoint trục trặc).
- Nếu AI endpoint chậm: demo bằng phiên đã chạy sẵn (link dự phòng), giải thích pipeline đang chạy thật ở phiên live.
- Nếu mạng chết: dùng JD dán tay + CV nhập tay — toàn bộ luồng vẫn chạy không cần internet (trừ AI endpoint).
