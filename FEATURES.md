# Các chức năng hiện có của SocialNet

Tài liệu này liệt kê những gì hệ thống **đang làm được** (không gồm ý tưởng chưa làm — xem `FEATURE_IDEAS.md`).
Công nghệ: React 19 + TypeScript + Tailwind 4 (giao diện), Express + MongoDB/Mongoose + Socket.IO (server).

---

## 1. Tài khoản & bảo mật đăng nhập
- **Đăng ký** (họ tên, username, email, mật khẩu ≥ 6 ký tự); username chỉ chữ/số/`_`/`.`; trùng email hoặc username bị từ chối.
- **Xác minh email**: đăng ký xong nhận email chứa liên kết (hiệu lực 24 giờ); dải nhắc "Email chưa được xác minh" kèm nút *Gửi lại email* / *Tôi đã xác minh*; trang `/verify-email`. Xác minh "mềm" (chưa xác minh vẫn dùng được).
- **Đăng nhập / đăng xuất** bằng JWT (hạn 7 ngày); nút hiện/ẩn mật khẩu.
- **Quên mật khẩu / đặt lại mật khẩu** qua email (liên kết 1 giờ, dùng một lần, mã lưu dạng băm).
- **Đổi mật khẩu** (phải nhập đúng mật khẩu hiện tại).
- Giới hạn số lần thử ở các API nhạy cảm (đăng nhập, đăng ký, quên/đặt lại mật khẩu, xác minh email).
- **Tài khoản bị khoá** (bởi quản trị viên): không đăng nhập được (trang đăng nhập hiện lý do), token cũ bị từ chối ở mọi API và Socket.IO; đang online thì bị đăng xuất ngay.

## 2. Hồ sơ cá nhân
- Xem hồ sơ của mình và của người khác, 4 tab: **Bài viết**, **Bạn bè**, **Hình ảnh**, **Giới thiệu**; thẻ giới thiệu nhanh (nơi làm việc, học vấn, nơi sống, ngày tham gia, website).
- **Chỉnh sửa**: họ tên, tiểu sử, nơi làm việc, học vấn, nơi sống, website, **ảnh đại diện**, **ảnh bìa** (upload, xem trước).
- **Khung ảnh đại diện**: 6 kiểu (không khung, xanh dương, xanh lá, hồng, vàng, cầu vồng) — hiện ở hồ sơ và bài viết.
- **Liên kết mạng xã hội**: Facebook, GitHub, LinkedIn, X, Instagram, YouTube, TikTok (chỉ nhận `http(s)://`, chặn `javascript:`).
- Số liệu: số bạn bè, số bài viết, **số người theo dõi / đang theo dõi**.
- Mở thẳng một tab bằng `?tab=photos`; lối tắt "Ảnh của tôi".

## 3. Bạn bè, theo dõi, chặn
- **Kết bạn**: gửi / huỷ lời mời, chấp nhận / từ chối, huỷ kết bạn; chặn gửi trùng, gửi cho người đã là bạn, lời mời ngược chiều; chấp nhận song song không tạo trùng.
- **Gợi ý kết bạn** (loại bạn bè, người đang có lời mời, người bị chặn).
- Trang **Bạn bè**: 3 tab (Bạn bè, Lời mời nhận/gửi, Gợi ý), tìm trong danh sách bạn, nhắn tin nhanh.
- **Theo dõi (follow)** một chiều, không cần kết bạn: nút *Theo dõi / Đang theo dõi*, đếm người theo dõi, thông báo cho người được theo dõi.
- **Chặn / bỏ chặn**: hai bên không thấy hồ sơ, bài viết, story của nhau, không kết bạn / nhắn tin / theo dõi được; chặn tự huỷ kết bạn, lời mời và theo dõi. Trang **Danh sách chặn**.

## 4. Bài viết
- **Đăng bài**: chữ, nhiều ảnh (lưới 1–4+ ảnh, "+N") **hoặc** video; xem trước, bỏ ảnh/video trước khi đăng.
- **Quyền riêng tư từng bài**: Công khai / Bạn bè / Chỉ mình tôi — áp dụng cho bảng tin, xem trực tiếp, cảm xúc, bình luận, chia sẻ và cả sự kiện realtime.
- **Cảm xúc/hoạt động** ("đang cảm thấy…"), **check-in vị trí**, **gắn thẻ bạn bè** (gõ `@` hoặc chọn từ danh sách; người được gắn nhận thông báo).
- **Đăng lên tường bạn bè** (chỉ bạn bè mới đăng được lên tường của nhau).
- **Hashtag**: `#tag` tự thành liên kết; trang `/hashtag/:tag` liệt kê bài theo tag (đúng quyền riêng tư); gõ `#tag` vào ô tìm kiếm để mở nhanh.
- **Cảm xúc đa dạng**: Thích, Yêu thích, Haha, Wow, Buồn, Phẫn nộ (rê chuột hoặc nhấn giữ trên điện thoại); mỗi người một cảm xúc, thao tác song song vẫn đúng.
- **Chỉnh sửa bài** có nhãn "đã chỉnh sửa" và **lịch sử chỉnh sửa** (xem các phiên bản cũ, tối đa 20).
- **Xoá bài**, **ghim bài** lên đầu trang cá nhân, **lưu bài** (trang *Đã lưu*), **sao chép liên kết**.
- **Chia sẻ**: lên trang cá nhân **kèm lời bình**, hoặc gửi qua tin nhắn cho bạn; bài riêng tư không bị "mở rộng" thành công khai khi chia sẻ.
- **Tắt / bật bình luận** cho từng bài (chủ bài); bình luận cũ vẫn xem được.
- **Báo cáo vi phạm** tới quản trị hệ thống: menu "…" của bài người khác, nút "Báo cáo" dưới bình luận, nút cờ ở reel, hồ sơ người dùng, trang nhóm và trang fanpage (chọn lý do + mô tả, xem mục 10e). Bài trong nhóm còn có "Báo cáo bài viết" riêng gửi quản trị viên nhóm.
- **Ẩn bài / không quan tâm** (chỉ ẩn ở bảng tin của mình) kèm nút **Hoàn tác** đưa bài về đúng vị trí.
- **Kỷ niệm**: bài của mình đăng đúng ngày–tháng này ở các năm trước.

## 5. Bảng tin
- Thanh story, ô đăng bài nhanh, **cuộn vô hạn** (và nút "Xem thêm" dự phòng).
- Bộ lọc **Tất cả / Bạn bè / Đang theo dõi** và sắp xếp **Mới nhất / Nổi bật** (điểm = cảm xúc + 2×bình luận + 3×chia sẻ; áp dụng cho các bài đã tải).
- **Khung xương** khi đang tải, **màn hình trống** theo từng bộ lọc, **màn hình lỗi có nút "Thử lại"**.
- Cột phải: lời mời kết bạn mới nhất (xác nhận ngay) và danh sách bạn (người đang online xếp trước, bấm để chat).

## 6. Bình luận
- Viết bình luận (chữ, ảnh, gắn thẻ bạn), **trả lời** (2 cấp), **sửa** (nhãn "đã chỉnh sửa"), **xoá** (tác giả hoặc chủ bài; chủ bài xoá bình luận người khác thì họ được báo).
- **Cảm xúc cho bình luận** (6 loại như bài viết) kèm chip tổng hợp; **sắp xếp** Cũ nhất / Mới nhất / Nổi bật.
- Chỉ ai xem được bài mới xem / bình luận / thả cảm xúc được; chủ bài nhận thông báo bình luận.

## 7. Story (tin 24 giờ)
- Đăng story **dạng chữ** (6 màu nền) hoặc **dạng ảnh**; công khai hoặc chỉ bạn bè; tự hết hạn sau 24 giờ.
- Trình xem toàn màn hình: tự chuyển sau 5 giây, giữ để tạm dừng, chạm/phím mũi tên để lùi/tiến, phím Esc để đóng.
- **Cảm xúc nhanh** (❤️ 🔥 👏 😮 😂, mỗi người một emoji, chủ story được thông báo) và **trả lời bằng tin nhắn**.
- Chủ story xem được **danh sách người đã xem** (kèm cảm xúc của từng người) và xoá story; người xem được ghi nhận một lần, chủ story không tự tính là người xem.

## 8. Nhắn tin
- Chat **1-1** (kể cả với người chưa kết bạn) và **nhóm** (từ 3 người, có tên nhóm); tìm hội thoại; tạo chat mới.
- Gửi chữ, emoji, **ảnh, tệp**, **bài viết** được chia sẻ; **thu hồi** tin của mình; **"Xóa với tôi"**; **thả cảm xúc** lên tin nhắn; **biệt danh** (có tin nhắn hệ thống); **màu chủ đề** cho từng cuộc trò chuyện.
- **Trạng thái tin**: Đã gửi → Đã nhận → Đã xem; **"đang gõ…"**; **online / "Hoạt động X phút trước"** theo thời gian thực (nhiều tab chỉ offline khi đóng tab cuối).
- Số tin chưa đọc trên menu; có tin mới (kể cả từ **người lạ**) thì cửa sổ chat tự bật lên (màn hình rộng).
- Cửa sổ chat nổi (tối đa 2, thu nhỏ được); **toàn màn hình trên điện thoại**.

## 9. Thông báo
- Realtime + toast: thích bài, bình luận, lời mời / chấp nhận kết bạn, được gắn thẻ, đăng lên tường, theo dõi, cảm xúc story, xoá bình luận…
- **Thông báo hệ thống** (từ quản trị viên: thông báo toàn hệ thống, nội dung bị gỡ, kết quả báo cáo của bạn) hiện là "Hệ thống: …" với biểu tượng khiên, không lộ tên quản trị viên.
- Menu chuông (5 mới nhất) và trang **Thông báo**: lọc (Tất cả / Chưa đọc / Tương tác bài viết / Bạn bè), **đánh dấu tất cả đã đọc**, tải thêm; bấm thông báo để mở đúng bài viết (cuộn tới và viền sáng) hoặc trang cá nhân.

## 10. Tìm kiếm tổng hợp
- Ô tìm kiếm trên thanh điều hướng tìm **cùng lúc người, nhóm, trang và bài viết** (gợi ý ngay khi gõ, xử lý đúng khi gõ nhanh); gõ `#tag` để mở trang hashtag; Enter hoặc "Xem tất cả" mở trang `/search` có tab **Tất cả / Mọi người / Nhóm / Trang / Bài viết**. Trên điện thoại là nút kính lúp mở thanh tìm kiếm phủ toàn chiều ngang.
- **Chỉ hiện những gì bạn được phép thấy**: bài công khai / bạn bè / nhóm công khai / nhóm bạn đã tham gia; không có bài riêng tư, bài chờ duyệt, nội dung nhóm kín, người bị chặn. Không tìm theo email.
- **Xếp theo quan hệ**: bạn bè → người đang theo dõi → người có bạn chung (càng nhiều càng cao); nhóm mình đã tham gia → nhóm có bạn bè đang ở; trang mình quản trị / theo dõi → trang bạn bè theo dõi; bài của bạn bè, người theo dõi, trong nhóm / trang của mình; cùng quan hệ thì xét độ khớp từ khoá, độ phổ biến, độ mới.
- Mỗi kết quả kèm **lý do** ("Bạn bè", "3 bạn chung", "2 bạn bè đã tham gia", "Nhóm của bạn"...).

## 10b. Nhóm giao lưu (Groups)
- **Tạo nhóm** công khai hoặc riêng tư, mô tả, nội quy, câu hỏi khi xin vào (tối đa 3), bật / tắt duyệt bài; ảnh nhóm + ảnh bìa; trang `/groups` (Nhóm của tôi / Khám phá, tìm theo tên).
- **Tham gia / rời nhóm**: mọi nhóm (kể cả công khai) đều phải **chờ quản trị viên duyệt**; nhóm riêng tư có câu hỏi phải trả lời đủ. Huỷ yêu cầu và rời nhóm đều hiện ô xác nhận. Chủ nhóm không rời được (phải chuyển quyền hoặc xoá nhóm).
- **Vai trò**: chủ nhóm > quản trị viên > thành viên. Chủ nhóm bổ nhiệm / gỡ quản trị viên, chuyển quyền, đổi quyền riêng tư, xoá nhóm; quản trị viên duyệt / từ chối yêu cầu, duyệt bài, xử lý báo cáo, đuổi thành viên thường, sửa nhóm.
- **Bài viết trong nhóm** (chỉ xem ở trang nhóm, không lên bảng tin / hồ sơ / hashtag / chia sẻ / lưu): thành viên đăng; nhóm bật duyệt thì bài của thành viên thường chờ quản trị viên duyệt (tác giả vẫn thấy bài của mình); quản trị viên xoá bài và bình luận; thành viên **báo cáo** bài cho quản trị viên.
- Nhóm riêng tư: người ngoài chỉ thấy thông tin cơ bản, không xem được bài và danh sách thành viên. Realtime và thông báo chỉ gửi cho thành viên nhóm / quản trị viên.

## 10c. Trang / fanpage (Pages)
- **Tạo trang** (danh mục thương hiệu / doanh nghiệp / cộng đồng / người của công chúng...), giới thiệu, website, địa chỉ, ảnh + bìa; trang `/pages` (Khám phá / Đang theo dõi / Trang của tôi).
- **Theo dõi / bỏ theo dõi** (đếm chính xác kể cả bấm song song); chủ trang được báo.
- **Quản trị**: chủ trang thêm / gỡ quản trị viên (quản trị viên tự rời được); chủ trang + quản trị viên đăng bài **với tư cách trang** (hiện ở bảng tin với tên trang), xoá bài của trang, sửa thông tin trang, xem danh sách người theo dõi; chỉ chủ trang xoá được trang.

## 10d. Reels (video ngắn)
- Trang `/reels`: cuộn dọc từng video, **tự phát** khi nằm trong khung nhìn và dừng khi rời đi, bật / tắt tiếng, thích, bình luận (ngăn kéo), số lượt xem (tính sau ~1 giây xem, mỗi lần mở một lượt), xoá reel của mình.
- **Đăng reel**: chọn video, chú thích ≤ 300 ký tự (có #hashtag), công khai hoặc bạn bè.
- Danh sách xếp theo độ phù hợp (bạn bè / người theo dõi lên trước, rồi tương tác và độ mới), cuộn tới cuối tự tải thêm; reel không lên bảng tin / hồ sơ và không chia sẻ lên trang cá nhân.

## 10e. Quản trị hệ thống (`/admin`)
- **Quyền quản trị** (`role = admin`): cấp bằng `npm run make-admin -- email@vd.vn` (thêm `--revoke` để thu hồi) hoặc ngay trong trang Người dùng. Quyền đọc từ database mỗi request nên thu hồi có hiệu lực tức thì. Lối vào hiện ở menu tài khoản và sidebar trái (chỉ với quản trị viên); người thường vào `/admin` bị đưa về bảng tin, API trả 403.
- **Tổng quan**: 10 số liệu (người dùng, online, mới hôm nay, bị khoá, quản trị viên, bài viết, reels, bình luận, nhóm, trang), báo cáo đang chờ và hoạt động quản trị gần đây.
- **Người dùng**: tìm theo tên / username / email, lọc (quản trị viên / người dùng / online / bị khoá), phân trang phía server; **khoá tài khoản kèm lý do** (bị đăng xuất và ngắt realtime ngay, không đăng nhập / gọi API / kết nối socket được, trang đăng nhập hiện lý do), mở khoá, cấp / thu hồi quyền quản trị. Không tự khoá / đổi quyền mình, không khoá quản trị viên khác.
- **Bài viết & Reels**, **Bình luận**, **Nhóm & Trang**: tìm theo nội dung / tác giả / tên, lọc theo loại (bài thường / reel / trong nhóm / của trang), **gỡ nội dung vi phạm** (xoá kèm bình luận / bài / thành viên phụ thuộc, báo cho chủ nội dung bằng thông báo hệ thống).
- **Báo cáo vi phạm**: người dùng báo cáo **bài viết, reel, bình luận, người dùng, nhóm, trang** (chọn lý do + mô tả; mỗi người báo cáo một đối tượng một lần; không tự báo cáo mình). Quản trị viên lọc theo trạng thái, **Gỡ nội dung** (đóng luôn mọi báo cáo chờ cùng đối tượng) / **Xác nhận** / **Bỏ qua** kèm ghi chú; người báo cáo nhận thông báo kết quả. Huy hiệu số báo cáo chờ ở menu cập nhật realtime.
- **Thông báo hệ thống**: soạn (tiêu đề, mức độ thông tin / cảnh báo / khẩn cấp, nội dung) và gửi tới mọi tài khoản đang hoạt động (theo lô, đẩy realtime); người dùng thấy "Hệ thống: …" thay vì tên quản trị viên.
- **Nhật ký quản trị** (audit log): ghi ai đã khoá / mở khoá, đổi quyền, gỡ nội dung, xử lý báo cáo, gửi thông báo — chỉ xem.

## 11. Giao diện & trải nghiệm
- **Responsive**: sidebar trái / phải trên màn hình lớn, **thanh điều hướng dưới** và menu thả xuống căng ngang trên điện thoại, hộp thoại dạng "bottom sheet".
- **Chế độ sáng / tối** (nhớ lựa chọn, mặc định theo hệ điều hành, đổi được ở menu tài khoản và trang đăng nhập).
- **Khung xương** khi tải, **màn hình trống**, **màn hình lỗi thân thiện** + `ErrorBoundary` (một trang lỗi không làm trắng cả ứng dụng).
- Toast (có nút hành động như "Hoàn tác"), hộp xác nhận thay `window.confirm`, đóng popup bằng Esc / bấm ra ngoài, cuộn lên đầu khi đổi trang.
- Khả năng truy cập: nhãn gắn đúng ô nhập, `aria-*` cho nút/menu/hộp thoại, viền focus bàn phím, tôn trọng `prefers-reduced-motion`.

## 12. Bảo mật & độ tin cậy phía server
- Mật khẩu băm bcrypt; JWT cho cả API lẫn Socket.IO; mọi API riêng tư yêu cầu đăng nhập.
- Kiểm tra dữ liệu vào bằng Zod (giới hạn độ dài, kiểu, định dạng id); chống NoSQL injection (`express-mongo-sanitize` + kiểm kiểu); loại bỏ trường lạ để chống ghi đè trường nhạy cảm.
- Upload chỉ nhận ảnh / video cho phép (không SVG/HTML/JS), tên tệp ngẫu nhiên, header `nosniff`.
- Quy tắc quyền xem (công khai / bạn bè / chỉ mình tôi / bị chặn) dùng chung cho API và sự kiện realtime.
- **Email là thông tin riêng tư**: chỉ chính chủ thấy email của mình; API không trả email của người khác và tìm kiếm không khớp theo email.
- Bài trong nhóm luôn "đóng" theo mặc định ở mọi đường cũ (bảng tin, hashtag, chia sẻ, lưu, ghim, realtime); chỉ code kiểm tra quyền thành viên mới mở ra.
- Bảng tin lọc quyền xem ngay trong truy vấn nên phân trang luôn đủ bài kể cả khi có hàng chục nghìn bài.
- Thao tác dễ xung đột (cảm xúc, đếm bình luận/chia sẻ, theo dõi, kết bạn, đọc/ghi trạng thái online) được làm **nguyên tử** hoặc **tuần tự** để không sai khi nhiều request song song.
- Id sai định dạng, JSON hỏng, lỗi bất ngờ đều trả mã lỗi JSON rõ ràng (không treo, không lộ chi tiết ở production).

## 13. Realtime (Socket.IO)
Server → trình duyệt: `account:banned` (bị khoá → đăng xuất), `account:role` (đổi quyền), `report:new` / `report:update` (chỉ quản trị viên), `message:new`, `message:delivered`, `typing`, `presence:update`, `notification:new`, `post:new` / `post:update` / `post:delete`, `comment:new` / `comment:delete`, `story:new` / `story:delete`, `friend-request:rejected` / `friend-request:cancelled`, `friend:removed`.
Trình duyệt → server: `typing`, `message:delivered`.

## 14. Vận hành & chất lượng
- **Triển khai** lên VPS Windows (PM2 + Nginx, workflow GitHub Actions dùng self-hosted runner) — xem `deploy/`.
- **CI** (`.github/workflows/test.yml`): typecheck + lint + test kèm độ phủ cho mỗi pull request.
- **Bộ test** (Vitest): hơn 4000 test — API + realtime (supertest, socket.io-client, MongoDB tạm), giao diện (Testing Library + backend giả trong bộ nhớ), ma trận quyền riêng tư / biên dữ liệu; độ phủ ~99,9% dòng lệnh và ≥ 98% nhánh, có ngưỡng tối thiểu khiến CI báo đỏ nếu tụt. Hướng dẫn trong `README.md`.
- Script dữ liệu: `db/seed-demo.ts` (demo), `db/seed-bulk.ts` (thêm 500 tài khoản + 10.000 bài để thử tải; ~60% bài có ảnh khớp chú thích theo 15 chủ đề, bình luận bám nội dung bài; `--reset` để xoá), `db/make-admin.ts` (cấp / thu hồi quyền quản trị), `db/export-json.ts`, `db/import-json.ts`; Postman collection kèm theo.
