# 📺 Livestream

Ứng dụng livestream thời gian thực được xây dựng với **React**, **Node.js**, **Express**, **Socket.IO** và **WebRTC**.

Dự án cho phép người dùng tạo livestream bằng camera hoặc chia sẻ màn hình, người xem có thể tham gia livestream và giao tiếp thông qua chat thời gian thực.

---

## ✨ Tính năng

### 🎥 Livestream

Broadcaster có thể lựa chọn nhiều chế độ phát:

- 📷 **Camera** — phát trực tiếp từ camera.
- 🖥️ **Screen** — chia sẻ màn hình và microphone.
- 📷 + 🖥️ **Both** — chia sẻ màn hình chính và camera phụ.

### 🎙️ Âm thanh

- Sử dụng microphone trực tiếp từ trình duyệt.
- Bật/tắt microphone trong khi livestream.
- Hỗ trợ microphone khi sử dụng chế độ `Both`.
- Viewer nhận âm thanh trực tiếp thông qua WebRTC.
- Hạn chế echo bằng cách tắt tiếng video camera phụ.

### 📷 Camera

- Camera trước.
- Camera sau trên thiết bị hỗ trợ.
- Chuyển đổi camera trong khi livestream.
- Bật/tắt camera.

### 🖥️ Chia sẻ màn hình

- Chia sẻ toàn bộ màn hình.
- Chia sẻ cửa sổ ứng dụng.
- Chia sẻ tab trình duyệt tùy theo trình duyệt.
- Có thể kết hợp chia sẻ màn hình với camera.

### 👥 Viewer

Viewer có thể:

- Xem danh sách livestream đang hoạt động.
- Nhập tên trước khi tham gia.
- Tham gia livestream.
- Xem số lượng người đang xem.
- Xem camera phụ khi Broadcaster sử dụng chế độ `Both`.
- Nhận trạng thái bật/tắt camera và microphone.
- Tự động nhận thông báo khi livestream kết thúc.

### 💬 Chat thời gian thực

Dự án sử dụng Socket.IO để hỗ trợ:

- Chat giữa Broadcaster và Viewer.
- Gửi tin nhắn theo livestream.
- Cập nhật realtime.

### 💾 Ghi hình livestream

Broadcaster có thể ghi lại livestream bằng:

- `MediaRecorder`
- `Canvas`
- `MediaStream`
- `Web Audio API`

Video sau khi livestream kết thúc có thể được xem và tải xuống dưới dạng:

```text
.webm
