# Hoạ Sĩ Dởm đến New York 🎨

Bản chơi online **thời gian thực** của board game **A Fake Artist Goes to New York**
(Jun Sasaki / Oink Games). Cả bàn cùng vẽ một bức tranh, mỗi người một nét, và một
người trong số đó không biết mình đang vẽ gì.

- **Realtime** qua WebSocket (Socket.IO): vào bàn bằng mã 4 ký tự. Nét vẽ được truyền
  **ngay khi đang vẽ**, cả bàn thấy cây bút chạy trên giấy.
- **Đăng nhập bằng mã email** (giống dự án Scout): nhập email → nhận mã 6 số → nhập mã.
  Chỉ các email trong `HOST_EMAILS` được **tạo bàn**; người khác chỉ vào bàn bằng mã.
- **Chat realtime** ở phòng chờ và trong ván, tin mới hiện bong bóng trên đầu người nói.
- **Máy chủ là trọng tài**: tên tranh và danh tính hoạ sĩ dởm không bao giờ nằm trong dữ
  liệu công khai trước khi lật bài.
- **Hai chế độ ra đề**: *Luân phiên* (luật gốc, mỗi vòng một người ra đề) hoặc *Máy ra đề*
  (chọn từ kho 13 chủ đề tiếng Việt, ai cũng được vẽ).
- **Bot** vẽ nguệch ngoạc để thử một mình hoặc cho đủ người.
- **Vào lại được**: F5 hay rớt mạng vẫn quay về đúng ghế. Ai vào giữa ván thì xem, và
  chơi từ vòng sau.
- **Hình vẽ lại toàn bộ bằng SVG**: nhân vật kiểu sách luật (10 phụ kiện), thẻ đề, 12 cây
  bút dạ, chip điểm 1 và 2, tờ giấy vẽ khung hồng. Tông giấy vẽ ấm, không dùng neon hay glow.
- **Hoạt ảnh** (Framer Motion): thẻ bay vào và lật 3D, con dấu “HOẠ SĨ DỞM”, đếm ngược
  “3, 2, 1, Chỉ!”, bút chạy theo nét, chip điểm bay, pháo giấy, xem lại tranh từng nét,
  phòng tranh cuối ván.
- Chạy tốt từ điện thoại tới desktop.

---

## Cấu trúc

```
├── shared/            # Luật thuần tuý, dùng chung server + client
│   ├── types.ts       # kiểu dữ liệu gửi qua socket
│   ├── engine.ts      # đếm phiếu, tính điểm, so đáp án, xoay người ra đề
│   └── words.ts       # kho đề tiếng Việt
├── server/            # Express + Socket.IO (trọng tài)
│   ├── src/room.ts    # máy trạng thái một bàn + tick() cho hẹn giờ và bot
│   ├── src/bot.ts     # bot vẽ nét ngẫu nhiên
│   ├── src/auth.ts    # đăng nhập bằng mã email (lấy từ Scout)
│   ├── src/index.ts   # socket + HTTP
│   ├── test/sim.ts    # 3 triệu assertion, 150 ván tự chơi
│   └── test/e2e.ts    # chơi trọn một ván qua socket thật
├── api/send-code.js   # hàm Vercel: gửi mail mã đăng nhập qua Gmail SMTP
└── client/            # React + Vite + Tailwind 4 + Framer Motion
    └── src/components/
        ├── Art.tsx        # nhân vật, thẻ, bút, chip, logo (SVG)
        ├── Canvas.tsx     # tờ giấy vẽ chung
        ├── GameScreen.tsx # bàn chơi
        └── Phases.tsx     # ra đề, lật thẻ, đếm ngược, đoán, kết quả, phòng tranh
```

---

## Chạy ở máy

```bash
npm install && npm run install:all
```

```bash
npm run dev          # server :4000 + client :5173
```

Khi chưa cấu hình gửi mail, mã đăng nhập in ra console của server và hiện ngay dưới ô
nhập mã, nên thử được mà không cần hộp thư. `HOST_EMAILS` để trống thì ai đăng nhập cũng
tạo được bàn. Cấu hình ở máy nằm trong `server/.env` (xem `server/.env.example`).

Muốn thử nhiều người trên một máy: mở `http://localhost:5173` và `http://127.0.0.1:5173`
(hai địa chỉ giữ phiên đăng nhập riêng), hoặc dùng cửa sổ ẩn danh, rồi thêm bot cho đủ.

Kiểm tra luật và chạy thử cả ván:

```bash
npm test
```

```bash
npx tsx server/test/e2e.ts
```

(`e2e.ts` cần server dev đang chạy.)

---

## Deploy

Client là trang tĩnh, còn server cần WebSocket chạy liên tục, nên tách làm hai:
**Vercel cho client, Render cho server.** Cách làm giống hệt Scout.

### 1. Server → Render.com

1. Push repo lên GitHub.
2. Trên Render: **New → Blueprint**, chọn repo. Render đọc `render.yaml` và tạo service
   `fake-artist-server`.
3. Build xong, mở `https://<url>/health` phải thấy `{"ok":true,...}`.

Tạo thủ công thì dùng:

| Mục | Giá trị |
| --- | --- |
| Runtime | Node |
| Build Command | `npm install --prefix server --include=dev && npm run build --prefix server` |
| Start Command | `npm run start --prefix server` |
| Health Check Path | `/health` |

> **Gói Free của Render**: service ngủ sau khoảng 15 phút không ai dùng, lần vào đầu tiên
> mất 30–60 giây để dậy, và ván đang chơi dở sẽ mất vì trạng thái nằm trong RAM.

### 2. Client → Vercel

1. **Add New → Project**, chọn repo, để nguyên thiết lập (Vercel đọc `vercel.json`).
2. Thêm biến môi trường `VITE_SERVER_URL` = URL Render (VD `https://fake-artist-server.onrender.com`).
3. Deploy.

### 3. Gửi email mã đăng nhập

Render Free chặn mọi cổng SMTP, nên Render nhờ hàm `api/send-code.js` trên Vercel gửi hộ
qua Gmail. Tạo một chuỗi bí mật dùng chung:

```bash
openssl rand -hex 32
```

**Trên Vercel**: `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_USER` (Gmail của bạn),
`SMTP_PASS` (app password 16 ký tự), `MAIL_FROM` (VD `Hoạ Sĩ Dởm <gmail-cua-ban@gmail.com>`),
`MAIL_RELAY_SECRET` (chuỗi vừa tạo). Đổi biến xong phải **Redeploy**.

**Trên Render**:

| Name | Value |
| --- | --- |
| `MAIL_RELAY_URL` | `https://<app-cua-ban>.vercel.app/api/send-code` |
| `MAIL_RELAY_SECRET` | cùng chuỗi bí mật |
| `HOST_EMAILS` | email được phép tạo bàn, cách nhau bằng dấu phẩy |
| `CLIENT_ORIGIN` | domain Vercel, để siết CORS |

Cách khác: `BREVO_API_KEY` (không cần domain) hoặc `RESEND_API_KEY` (cần domain).
`SESSION_SECRET` do Render tự sinh; đừng đổi, nếu không mọi người sẽ bị đăng xuất.

> Quên đặt `HOST_EMAILS` thì **ai cũng tạo được bàn**. Kiểm tra bằng `/health`:
> `"hostRestricted": true` nghĩa là đã giới hạn.

### Biến môi trường

| Nơi | Biến | Mặc định | Ý nghĩa |
| --- | --- | --- | --- |
| server | `PORT` | `4000` | Render tự đặt |
| server | `CLIENT_ORIGIN` | `*` | Origin được phép, cách nhau bằng dấu phẩy |
| server | `SESSION_SECRET` | tự sinh | Khoá ký phiên đăng nhập (30 ngày) |
| server | `HOST_EMAILS` | (trống = ai cũng tạo được) | Email được phép tạo bàn |
| server | `MAIL_RELAY_URL` / `MAIL_RELAY_SECRET` | — | Nhờ Vercel gửi mail (khuyên dùng) |
| server | `BREVO_API_KEY` / `RESEND_API_KEY` | — | Gửi mail qua API |
| server | `SMTP_*` | — | Gửi mail qua SMTP (chỉ chạy ở máy) |
| server | `MAIL_FROM` | `Hoạ Sĩ Dởm <no-reply@…>` | Người gửi |
| Vercel | `SMTP_*`, `MAIL_FROM`, `MAIL_RELAY_SECRET` | — | Cho hàm `api/send-code` |
| client | `VITE_SERVER_URL` | `localhost:4000` khi dev | URL server realtime |

---

## Luật đã cài đặt

Theo sách luật tiếng Anh trong `rule_fakeartist_e.pdf`:

- **Vai**: người ra đề (không vẽ), một hoạ sĩ dởm (thẻ X), còn lại là hoạ sĩ.
- **Ra đề**: công bố chủ đề, bí mật viết tên tranh. Người ra đề chọn ai vẽ trước (mặc định
  ngẫu nhiên) và có thể nhập thêm đáp án chấp nhận.
- **Vẽ**: mỗi lượt **một nét liền**, chiều kim đồng hồ, **hai vòng**. Nhấc bút xong được
  chọn *Vẽ lại* hoặc *Xong nét này*; hết giờ thì nét đang có được tính.
- **Chỉ tay**: đếm “3, 2, 1, Chỉ!”, mọi hoạ sĩ (kể cả hoạ sĩ dởm) cùng chỉ, không chỉ chính
  mình, đổi được tới khi mọi người chỉ xong.
- **Bị bắt** = bị chỉ nhiều nhất **một mình**; hoà hay không ai chỉ thì coi như thoát.
- **Đoán**: hoạ sĩ dởm bị bắt được đoán **một lần**. Không phân biệt hoa thường, dấu, khoảng
  trắng, và bỏ qua chữ “con/cái/quả/…” ở đầu.
- **Điểm**: thoát, hoặc bị bắt mà đoán đúng → hoạ sĩ dởm và người ra đề +2. Bị bắt và đoán
  sai → mỗi hoạ sĩ thật +1. Chế độ Máy ra đề thì chỉ hoạ sĩ dởm được +2.
- **Vòng sau**: người bên trái người ra đề sẽ ra đề. Ai đạt mức điểm (mặc định 5) trước thì
  thắng; nhiều người cùng cao nhất thì cùng thắng.

### Chống treo bàn

- Ra đề 90 giây, xem thẻ 20 giây, mỗi nét 20/40/60 giây (tuỳ bàn), chỉ tay 45 giây, đoán
  50 giây. Hết giờ thì máy làm thay (ra đề ngẫu nhiên, bỏ lượt, đoán sai).
- Người mất kết nối quá 12 giây bị bỏ qua lượt; quay lại là lấy ghế về ngay.
- Chủ bàn vắng quá 30 giây thì quyền chủ bàn chuyển cho người khác.
- Màn kết quả tự chuyển vòng sau 25 giây. Bàn bỏ không 1 giờ sẽ tự xoá.

---

## Bản quyền

A Fake Artist Goes to New York do **Jun Sasaki** thiết kế, **Oink Games** phát hành. Đây là
bản dựng lại phi thương mại để chơi với bạn bè. Mọi hình ảnh trong `client/src/components`
đều được vẽ lại bằng SVG, không dùng artwork gốc. Nếu thích trò này, hãy mua bản giấy.
