# 🦈 CAP NHẬT BOT SHARK STORE — 17/09/2026

## 1. Lỗi đã sửa

### Ảnh embed bị chết (404) — QUAN TRỌNG NHẤT
Toàn bộ link ảnh Discord (logo, banner, GIF legit) đã hết hạn chữ ký → mọi
embed hiển thị ảnh lỗi. Đã gom toàn bộ ảnh về **một chỗ duy nhất**:

- File `config.js` → mục `IMAGES` (logo, banner, legitGif)
- Cách sửa nhanh: upload ảnh vào 1 kênh Discord riêng → chuột phải ảnh →
  "Sao chép liên kết" → dán vào `config.js`. **Lưu ý:** link Discord kiểu này
  vẫn sẽ hết hạn sau ~24h, nên cách gốc là:

- **Cách nên dùng (không bao giờ chết):** bỏ 3 file vào thư mục `assets/`
  (xem `assets/README.txt`): `logo.png`, `banner.png`, `legit.gif`.
  Bot sẽ tự upload kèm từng tin nhắn → ảnh sống vĩnh viễn.

### Bug sập bot ở dashboard
Hàm `escapeHtml` được gọi nhưng chưa từng tồn tại → mở `/dashboard` là cả
process bot sập. Đã định nghĩa hàm + bọc try/catch toàn bộ web server.

### Bảng giá sai tiêu đề
- Capcut Pro từng có tiêu đề "Bảng Giá Adobe Creative Cloud" → đã sửa.
- Canva Pro tương tự → đã sửa.

## 2. Tính năng mới

### 🛡️ Auto-Role cấp vai trò tự động cho người mới
- Lệnh `/setup-autorole` (Admin):
  - `role`: Role chính tự động cấp cho người mới vừa vào server (ví dụ: `Khách Hàng` hoặc `Thành Viên`).
  - `role_phu`: Role phụ thứ hai cấp cùng lúc (ví dụ: `══✿══╡°˖✧ 𝐈𝐍𝟒 ✧˖°╞══✿══`).
  - `tat`: Tắt tính năng tự cấp role.
- Lệnh `/autorole`: Xem nhanh trạng thái role tự cấp hiện tại.
- **Cơ chế thông minh:** Nếu chưa chạy lệnh cài đặt, bot tự động tìm và cấp role `Khách Hàng` / `Thành Viên` và role `IN4` sẵn có trên server.
- **Lưu ý phân quyền Discord:** Role của Bot trong **Cài đặt máy chủ > Vai trò** phải nằm **TRÊN** role cần cấp thì bot mới có quyền phát role.

### 🎉 Welcome cư dân mới (thay bot welcome đang dùng)
- Lệnh `/setup-welcome` (Admin):
  - `channel`: kênh chào mừng
  - `loi_chao`: lời chào tùy chỉnh, hỗ trợ `{user}` `{username}` `{server}` `{memberCount}`
  - `role`: **auto-role** cấp cho thành viên mới khi vào server
  - `tat`: chọn **Có** để tắt hẳn welcome
- Cài xong bot gửi luôn 1 tin mẫu vào kênh để bạn xem trước.
- **BẮT BUỘC:** vào https://discord.com/developers/applications → chọn app bot →
  mục **Bot** → bật **SERVER MEMBERS INTENT** → Save. Không bật là bot KHÔNG
  đăng nhập được (bot sẽ in hướng dẫn ra console nếu quên).
- Xong thì gỡ/kick con bot welcome cũ để khỏi chào 2 lần.

### 🎫 Transcript ticket (đúng như gói Standard đang quảng cáo)
- Lệnh `/setup-log` (Admin) chọn kênh log.
- Mỗi ticket khi bị đóng/xoá (kể cả tự đóng sau 48h) sẽ được lưu thành file
  `.txt` (tối đa 100 tin nhắn gần nhất) gửi vào kênh log kèm embed tóm tắt.

### Khác
- `/set-price` giờ hỗ trợ nhập `reset` ở mục `price` để trả giá về mặc định,
  và chặn đổi nhầm dòng hướng dẫn ở cuối bảng.
- Nút "Xác Nhận Đóng" ticket giờ chỉ khách mở ticket hoặc staff bấm được.
- Bot không còn ghi file settings mỗi tin nhắn (ghép lại ghi mỗi 15s, thoát
  bot vẫn lưu) — đỡ tốn I/O trên Discloud/Render.
- Thêm error handlers toàn cục: lỗi promise/webserver không còn làm bot ngủm.
- Nếu quên bật intent, console in hướng dẫn tiếng Việt rõ ràng.
- Dọn file rác: xoá `config1.js`.

## 3. Việc cần làm sau khi cập nhật

1. **Bật SERVER MEMBERS INTENT** trong Developer Portal (bắt buộc — xem trên).
2. Chạy `npm run deploy` để đăng ký 2 lệnh mới (`/setup-welcome`, `/setup-log`).
3. Chạy bot lại: `npm start` hoặc `run.bat`.
4. Dùng `/setup-welcome` và `/setup-log` trong server.
5. Bỏ 3 file ảnh vào `assets/` (xem `assets/README.txt`).
6. **Regenerate token** bot ở Developer Portal (file .env đã từng gửi ra ngoài).
7. Gỡ bot welcome cũ khỏi server.
