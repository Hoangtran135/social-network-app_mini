# Chức năng hiện có theo từng phần của hệ thống

Bổ sung cho [FEATURES.md](FEATURES.md) (liệt kê theo nhóm chức năng). File này đi theo **cấu trúc dự án**: mỗi màn hình giao diện và mỗi nhóm API cho biết nó làm được gì, để tra cứu nhanh khi sửa code.

> Ký hiệu: 🔒 = cần đăng nhập · ⚡ = có sự kiện realtime (Socket.IO)

---

# PHẦN 1 — GIAO DIỆN (`src/`)

## 1.1 Các màn hình (route trong `src/App.tsx`)

### Nhóm chưa đăng nhập
| Đường dẫn | Màn hình | Chức năng |
|---|---|---|
| `/login` | Đăng nhập | Email + mật khẩu, hiện/ẩn mật khẩu, liên kết "Quên mật khẩu?", nút đổi sáng/tối |
| `/register` | Đăng ký | Họ tên, username, email, mật khẩu; báo lỗi từng ô |
| `/forgot-password` | Quên mật khẩu | Nhập email để nhận liên kết đặt lại (không tiết lộ email có tồn tại hay không) |
| `/reset-password` | Đặt lại mật khẩu | Đặt mật khẩu mới từ liên kết trong email |
| `/verify-email` | Xác minh email | Xác nhận email từ liên kết; thông báo thành công / liên kết hết hạn |

### Nhóm đã đăng nhập (🔒, dùng chung bố cục `MainLayout`)
| Đường dẫn | Màn hình | Chức năng |
|---|---|---|
| `/` | Bảng tin | Thanh story, ô đăng nhanh, lọc Tất cả / Bạn bè / Đang theo dõi, sắp xếp Mới nhất / Nổi bật, cuộn vô hạn, khung xương khi tải, màn hình lỗi "Thử lại" |
| `/profile/:id` | Trang cá nhân | Ảnh bìa + avatar (có khung), tiểu sử, liên kết mạng xã hội, số bạn / bài / người theo dõi; tab Bài viết, Bạn bè, Hình ảnh, Giới thiệu (`?tab=photos`); nút Kết bạn / Theo dõi / Nhắn tin / Chặn; bài ghim |
| `/settings` | Cài đặt tài khoản | Lối vào sửa hồ sơ, danh sách chặn; đổi mật khẩu |
| `/settings/profile` | Sửa hồ sơ | Họ tên, tiểu sử, nơi làm việc, học vấn, nơi sống, website, ảnh bìa, ảnh đại diện, khung avatar (6 kiểu), 7 liên kết mạng xã hội |
| `/settings/blocked` | Danh sách chặn | Xem và bỏ chặn |
| `/friends` | Bạn bè | Tab Bạn bè (tìm trong danh sách, nhắn tin, huỷ kết bạn), Lời mời (nhận / đã gửi), Gợi ý kết bạn |
| `/notifications` | Thông báo | Lọc Tất cả / Chưa đọc / Tương tác bài viết / Bạn bè; đánh dấu tất cả đã đọc; bấm để mở đúng bài viết |
| `/saved` | Bài viết đã lưu | Danh sách bài đã lưu |
| `/memories` | Kỷ niệm | Bài của mình đăng cùng ngày–tháng ở các năm trước |
| `/hashtag/:tag` | Bài theo hashtag | Bài công khai / được phép xem có hashtag đó |
| `/search` | Kết quả tìm kiếm | Tìm người + nhóm + trang + bài viết; tab Tất cả / Mọi người / Nhóm / Trang / Bài viết; kết quả đã lọc quyền xem và xếp theo quan hệ, kèm lý do |
| `/post/:id` | Một bài viết | Mở một bài (đích của kết quả tìm kiếm); không có quyền / không tồn tại → màn hình lỗi |
| `/groups` | Danh sách nhóm | Nhóm của tôi / Khám phá, tìm theo tên, tạo nhóm |
| `/groups/:id` | Một nhóm | Ảnh bìa, vai trò, Tham gia / Xin tham gia / Rời nhóm; tab Bài viết (đăng, bài chờ duyệt của mình), Thành viên (quản lý), Giới thiệu (nội quy), Quản trị (yêu cầu, bài chờ duyệt, báo cáo, cài đặt, xoá nhóm) |
| `/pages` | Danh sách trang | Khám phá / Đang theo dõi / Trang của tôi, tìm theo tên, tạo trang |
| `/pages/:id` | Một trang (fanpage) | Theo dõi / bỏ theo dõi; tab Bài viết (quản trị viên đăng với tư cách trang), Giới thiệu, Quản trị (thông tin, quản trị viên, người theo dõi, xoá trang) |
| `/reels` | Reels | Video ngắn cuộn dọc, tự phát, thích, bình luận, lượt xem, bật / tắt tiếng, tạo / xoá reel; `?reel=<id>` mở thẳng một reel |
| `/admin` · `/admin/users` · `/admin/posts` · `/admin/comments` · `/admin/groups` · `/admin/reports` · `/admin/announcements` · `/admin/audit` | 🛡️ Khu quản trị (chỉ `role = admin`, bố cục riêng `AdminLayout`) | Tổng quan số liệu; quản lý người dùng (khoá có lý do, cấp quyền); kiểm duyệt bài / reel / bình luận / nhóm / trang; xử lý báo cáo; gửi thông báo hệ thống; nhật ký quản trị |
| `*` | — | Chuyển về `/` |

## 1.2 Khung bố cục (`src/layout/`)
| Thành phần | Chức năng |
|---|---|
| `Navbar` | Logo, tìm kiếm, Trang chủ / Bạn bè (có huy hiệu), nút Đăng bài, menu Tin nhắn / Thông báo (5 mới nhất) / Tài khoản (hồ sơ, đã lưu, kỷ niệm, cài đặt, chế độ sáng–tối, đăng xuất) |
| `SearchBox` | Gợi ý người / nhóm / trang / bài viết khi gõ (chống kết quả cũ chen vào), Enter hoặc "Xem tất cả" mở `/search`, gõ `#tag` để mở trang hashtag; mobile: kính lúp mở thanh phủ ngang |
| `LeftSidebar` | Thẻ tài khoản + lối tắt (Bảng tin, Trang cá nhân, Bạn bè, Nhóm, Trang, Reels, Thông báo, Kỷ niệm, Ảnh của tôi, Đã lưu, Cài đặt) |
| `RightSidebar` | 2 lời mời kết bạn mới nhất (xác nhận / xoá ngay), danh sách người liên hệ (online xếp trước, bấm để chat) |
| `MobileNav` | Thanh dưới trên điện thoại: Trang chủ, Bạn bè, Đăng bài, Thông báo, Cá nhân |
| `MainLayout` | Ghép các phần trên + `VerifyEmailBanner`, `ErrorBoundary`, hộp thoại đăng bài, cửa sổ chat nổi, toast |
| `AuthLayout` | Khung các trang đăng nhập / đăng ký (logo, nút đổi sáng–tối) |

## 1.3 Thành phần dùng lại (`src/components/`)
| Nhóm | Thành phần | Chức năng |
|---|---|---|
| Bài viết | `PostCard` | Hiển thị bài (tác giả, quyền riêng tư, cảm xúc/hoạt động, vị trí, gắn thẻ, ảnh lưới / video, nhãn "đã chỉnh sửa"); menu: sửa, lịch sử sửa, xoá, ghim, lưu, sao chép liên kết, ẩn bài (hoàn tác), tắt/bật bình luận; thích kèm 6 cảm xúc; chia sẻ kèm lời bình hoặc gửi qua tin nhắn |
| | `PostFormModal` | Tạo / sửa bài: chữ, nhiều ảnh hoặc video, quyền riêng tư, cảm xúc, vị trí, gắn thẻ bạn (`@`), đăng lên tường bạn |
| | `CreatePostBox` | Ô "Bạn đang nghĩ gì?" mở hộp thoại đăng bài |
| | `PostContent` | Hiển thị nội dung: `#hashtag` và `@mention` thành liên kết |
| | `CommentSection` | Bình luận 2 cấp, sửa, xoá, ảnh, gắn thẻ, 6 cảm xúc + chip tổng hợp, sắp xếp Cũ nhất / Mới nhất / Nổi bật |
| | `MentionSuggestions` | Gợi ý bạn bè khi gõ `@` |
| Story | `StoryBar` | Thẻ "Tạo tin" + danh sách story (viền xanh chưa xem / xám đã xem) |
| | `CreateStoryModal` | Story chữ (6 màu nền) hoặc ảnh; công khai / bạn bè |
| | `StoryViewer` | Toàn màn hình: tự chuyển 5s, giữ để dừng, phím mũi tên / Esc, cảm xúc nhanh, trả lời bằng tin nhắn, chủ story xem danh sách người xem và xoá |
| Chat | `ChatListDropdown` | Danh sách hội thoại + ô tìm + tạo chat mới (1-1 / nhóm) |
| | `ChatWindow` | Cửa sổ chat: gửi chữ / emoji / ảnh / tệp, thu hồi, "Xóa với tôi", cảm xúc tin nhắn, biệt danh, màu chủ đề, "đang gõ…", Đã gửi → Đã nhận → Đã xem, thẻ bài viết được chia sẻ |
| | `ChatWindowsLayer` | Tối đa 2 cửa sổ nổi, thu nhỏ được; toàn màn hình trên điện thoại; tin từ người lạ tự bật cửa sổ |
| Nhóm | `components/group/*` | `CreateGroupModal`, `JoinGroupModal` (trả lời câu hỏi), `GroupMembersTab` (menu bổ nhiệm / gỡ quyền / chuyển quyền / xoá), `GroupAdminTab` (yêu cầu tham gia, bài chờ duyệt, báo cáo, cài đặt), `groupUi` (ảnh nhóm, nhãn riêng tư, nhãn vai trò) |
| Trang | `components/page/*` | `CreatePageModal`, `PageAdminTab` (thông tin, quản trị viên, người theo dõi, xoá trang), `pageUi` (danh mục) |
| Reels | `components/reel/CreateReelModal` | Chọn video + chú thích + quyền riêng tư để đăng reel |
| Tìm kiếm | `components/search/SearchResultItems` | Các dòng kết quả (người, nhóm, trang, bài) kèm chip lý do — dùng chung cho ô tìm kiếm và trang `/search` |
| Chung | `ui.tsx` | `PageHeader`, `EmptyState`, `ErrorState`, `PageLoading`, `Skeleton`/`PostSkeleton`/`ListSkeleton`, `TabButton`, `FormField` (có nút hiện/ẩn mật khẩu), `Avatar` (chấm online), `AvatarFrame`, `CountBadge`, `UserLinks` |
| | `Toast` | Thông báo nổi, có nút hành động (vd "Hoàn tác") |
| | `ErrorBoundary` | Một trang lỗi không làm trắng cả ứng dụng |
| | `VerifyEmailBanner` | Nhắc xác minh email, gửi lại, "Tôi đã xác minh" |
| | `FriendPicker` | Chọn bạn bè (gắn thẻ, tạo nhóm chat) |

## 1.4 Trạng thái & hạ tầng phía client
| Phần | Chức năng |
|---|---|
| `AuthContext` | Đăng nhập / đăng ký / đăng xuất, giữ phiên (JWT), cập nhật hồ sơ, `refreshUser`, gửi lại email xác minh |
| `SocialContext` | Toàn bộ dữ liệu xã hội (bài, bạn bè, lời mời, thông báo, hội thoại, story, theo dõi, bài theo tag) + hành động tương ứng; nhận sự kiện realtime; trạng thái tải / lỗi từng phần |
| `ChatWindowsContext` | Quản lý các cửa sổ chat đang mở |
| `ConfirmDialogContext` | Hộp xác nhận thay `window.confirm` |
| `ThemeContext` | Sáng / tối / theo hệ điều hành, nhớ lựa chọn |
| `utils/api.ts`, `socket.ts` | Gọi REST kèm token; kết nối Socket.IO kèm token |
| `utils/*` | `feedScore` (điểm "Nổi bật"), `hashtag`, `mention`, `reactions`, `avatarFrames`, `socialLinks`, `searchFormat` (đường dẫn + tóm tắt kết quả), `format` (thời gian "x phút trước") |
| `hooks/*` | `useFileUpload`, `useMention`, `useReactionPicker`, `useClickOutside`, `useEscapeKey`, `useOpenNotification`, `useGroupAction` (chạy thao tác quản lý + toast + khoá nút) |
| `index.css` | Hệ thống thiết kế chung: chiều cao điều khiển 40px, bo góc, chữ, khung `app-container`, 3 mức bề rộng trang, chế độ tối |

---

# PHẦN 2 — MÁY CHỦ (`server/`)

## 2.1 API (tiền tố `/api`, 🔒 trừ phần Auth công khai)

### Auth — `/api/auth`
| Phương thức & đường dẫn | Chức năng |
|---|---|
| `POST /register` | Đăng ký; gửi email xác minh |
| `POST /login` | Đăng nhập, trả JWT (hạn 7 ngày) |
| `POST /forgot-password` · `POST /reset-password` | Quên / đặt lại mật khẩu qua email (mã băm, dùng một lần, hạn 1 giờ) |
| `POST /verify-email` · `POST /resend-verification` | Xác minh email (hạn 24 giờ) / gửi lại |
| `POST /logout` · `GET /me` 🔒 | Đăng xuất · lấy hồ sơ của mình (kèm `emailVerified`) |

### Người dùng — `/api/users`
| Phương thức & đường dẫn | Chức năng |
|---|---|
| `GET /` | Tìm người theo tên / username (có phân trang, lọc `online`), loại người bị chặn |
| `GET /:id` | Xem hồ sơ (404 nếu bị chặn) |
| `PATCH /me` | Sửa hồ sơ, khung avatar, liên kết mạng xã hội (chỉ `http(s)`, gộp từng liên kết) |
| `PATCH /me/password` | Đổi mật khẩu (phải đúng mật khẩu cũ) |
| `POST /:id/block` · `DELETE /:id/block` · `GET /me/blocked` | Chặn / bỏ chặn / danh sách chặn (chặn tự huỷ bạn bè, lời mời, theo dõi) |
| `POST /:id/follow` · `DELETE /:id/follow` ⚡ | Theo dõi / bỏ theo dõi (không tự theo dõi, không trùng) |
| `GET /:id/follow-stats` · `GET /me/following` | Số người theo dõi / đang theo dõi, trạng thái đang theo dõi · danh sách mình theo dõi |

### Bạn bè — `/api/friends`
| Phương thức & đường dẫn | Chức năng |
|---|---|
| `GET /` · `GET /of/:userId` | Danh sách bạn của mình / của người khác |
| `GET /suggestions` | Gợi ý kết bạn (loại bạn, người đang có lời mời, người bị chặn) |
| `GET /requests` · `GET /requests/sent` | Lời mời nhận / đã gửi |
| `POST /requests` ⚡ | Gửi lời mời (chặn trùng, tự gửi, đã là bạn, lời mời ngược chiều, bị chặn) |
| `POST /requests/:id/accept` · `…/reject` ⚡ | Chấp nhận (không tạo bạn trùng khi bấm song song) / từ chối |
| `DELETE /requests/:id` ⚡ · `DELETE /:userId` ⚡ | Huỷ lời mời đã gửi · huỷ kết bạn |

### Bài viết — `/api/posts`
| Phương thức & đường dẫn | Chức năng |
|---|---|
| `GET /` | Bảng tin có phân trang; `?tag=` lọc theo hashtag; chỉ trả bài được phép xem |
| `GET /memories` · `GET /:id` | Kỷ niệm "ngày này năm xưa" · xem một bài (đúng quyền riêng tư) |
| `POST /` ⚡ | Đăng bài: chữ, ảnh / video, quyền riêng tư, cảm xúc, vị trí, gắn thẻ, đăng lên tường bạn; tự trích hashtag; bài rỗng bị từ chối |
| `PATCH /:id` ⚡ · `DELETE /:id` ⚡ | Sửa (lưu lịch sử, tối đa 20) / xoá — chỉ tác giả |
| `POST /:id/react` ⚡ | 6 cảm xúc; mỗi người một cảm xúc; cập nhật nguyên tử nên thao tác song song vẫn đúng |
| `POST /:id/pin` · `/toggle-comments` | Ghim lên trang cá nhân · tắt / bật bình luận — chỉ tác giả |
| `POST /:id/hide` · `DELETE /:id/hide` | Ẩn bài khỏi bảng tin của mình / hoàn tác |
| `POST /:id/save` | Lưu / bỏ lưu |
| `POST /:id/share` ⚡ | Chia sẻ kèm lời bình; không "mở rộng" bài riêng tư |

### Bình luận — `/api/comments`
| Phương thức & đường dẫn | Chức năng |
|---|---|
| `GET /` · `POST /` ⚡ | Lấy theo bài · viết (có trả lời `parentId`, ảnh, gắn thẻ); 403 khi bài đã tắt bình luận |
| `PATCH /:id` | Sửa (đánh dấu `editedAt`) — chỉ tác giả |
| `DELETE /:id` ⚡ | Xoá — tác giả hoặc chủ bài (chủ bài xoá thì người viết được báo) |
| `POST /:id/react` ⚡ (và `/like`) | Cảm xúc bình luận, cập nhật nguyên tử |

### Story — `/api/stories`
| Phương thức & đường dẫn | Chức năng |
|---|---|
| `GET /` · `POST /` ⚡ | Story còn hạn (24 giờ) đúng quyền công khai / bạn bè · đăng story chữ hoặc ảnh |
| `DELETE /:id` ⚡ | Xoá — chỉ chủ story |
| `POST /:id/view` | Ghi nhận người xem một lần (chủ story không tính) |
| `POST /:id/react` | 5 emoji (❤️ 🔥 👏 😮 😂), mỗi người một emoji; báo cho chủ story |

### Tin nhắn — `/api/messages`
| Phương thức & đường dẫn | Chức năng |
|---|---|
| `GET /conversations` · `POST /conversations` | Danh sách hội thoại · tạo chat 1-1 (kể cả người lạ) hoặc nhóm (có tên) |
| `PATCH /conversations/:id/nickname` | Đặt biệt danh (có tin nhắn hệ thống) |
| `GET/POST /conversations/:id/messages` ⚡ | Lịch sử (chỉ thành viên) · gửi tin chữ / ảnh / tệp (≤ 5000 ký tự) |
| `POST /conversations/:id/share-post` ⚡ | Gửi bài viết qua tin nhắn |
| `DELETE …/messages/:messageId` ⚡ | Thu hồi tin của mình (người khác bị 403) |
| `POST …/messages/:messageId/delete-for-me` | "Xóa với tôi" — chỉ ẩn phía mình |
| `POST …/messages/:messageId/react` ⚡ | Thả cảm xúc tin nhắn |

### Thông báo — `/api/notifications`
| Phương thức & đường dẫn | Chức năng |
|---|---|
| `GET /` | Danh sách thông báo của mình |
| `PATCH /:id/read` · `PATCH /read-all` | Đánh dấu đã đọc một cái / tất cả |

### Tải tệp — `/api/upload`
| Phương thức & đường dẫn | Chức năng |
|---|---|
| `POST /` | Upload ảnh / video / tệp cho phép (không SVG/HTML/JS), tên ngẫu nhiên, giới hạn dung lượng |

### Nhóm — `/api/groups`
| Phương thức & đường dẫn | Chức năng |
|---|---|
| `GET /` · `POST /` | Danh sách (`scope=mine` / khám phá, `q`) · tạo nhóm (người tạo là chủ nhóm) |
| `GET /:id` · `PATCH /:id` · `DELETE /:id` | Xem (quản trị viên kèm số việc chờ xử lý) · sửa (quản trị viên; đổi quyền riêng tư chỉ chủ nhóm) · xoá (chủ nhóm, xoá cả bài / bình luận / thành viên) |
| `POST /:id/join` · `DELETE /:id/join` | Tham gia (riêng tư: trả lời câu hỏi, chờ duyệt) · rời nhóm / huỷ yêu cầu (chủ nhóm không rời được) |
| `GET /:id/members` | Thành viên (`status=pending` chỉ quản trị viên, kèm câu trả lời) |
| `POST /:id/members/:userId/approve` · `…/reject` | Duyệt / từ chối yêu cầu (nguyên tử: 2 người duyệt cùng lúc chỉ tính một lần) |
| `PATCH /:id/members/:userId` · `DELETE …` | Bổ nhiệm / gỡ quản trị viên (chủ nhóm) · đuổi thành viên (quản trị viên đuổi thành viên thường; chủ nhóm đuổi cả quản trị viên) |
| `POST /:id/transfer` | Chuyển quyền chủ nhóm (chủ cũ thành quản trị viên) |
| `GET /:id/posts` · `POST /:id/posts` | Bài của nhóm (`status=pending`: quản trị viên thấy tất cả, thành viên thấy bài của mình) · đăng bài (nhóm bật duyệt → chờ duyệt) |
| `POST /:id/posts/:postId/approve` · `…/reject` · `DELETE …` | Duyệt · từ chối · xoá bài (tác giả hoặc quản trị viên) |
| `POST /:id/posts/:postId/report` | Thành viên báo cáo bài (mỗi người một lần, không báo cáo bài của mình) |
| `GET /:id/reports` · `POST /:id/reports/:reportId/resolve` | Báo cáo chưa xử lý · bỏ qua / xoá bài |

### Trang (fanpage) — `/api/pages`
| Phương thức & đường dẫn | Chức năng |
|---|---|
| `GET /` · `POST /` | Danh sách (`scope=mine` / `following` / khám phá, `q`) · tạo trang |
| `GET /:id` · `PATCH /:id` · `DELETE /:id` | Xem (quản trị viên thấy danh sách quản trị) · sửa (quản trị viên) · xoá (chủ trang; xoá cả bài / bình luận / lượt theo dõi) |
| `POST /:id/follow` · `DELETE /:id/follow` | Theo dõi / bỏ theo dõi (không trùng, đếm nguyên tử) |
| `GET /:id/followers` | Người theo dõi (quản trị viên) |
| `POST /:id/admins` · `DELETE /:id/admins/:userId` | Chủ trang thêm quản trị viên · gỡ (chủ trang gỡ ai cũng được; quản trị viên tự rời) |
| `GET /:id/posts` · `POST /:id/posts` · `DELETE /:id/posts/:postId` | Bài của trang · đăng với tư cách trang · xoá bài (quản trị viên) |

### Reels — `/api/reels`
| Phương thức & đường dẫn | Chức năng |
|---|---|
| `GET /` | Reel xếp theo độ phù hợp (bạn bè / người theo dõi trước, rồi tương tác + độ mới), có `limit` / `skip` |
| `GET /:id` · `POST /` | Một reel (đúng quyền xem) · đăng reel (bắt buộc có video) |
| `POST /:id/view` | Ghi nhận lượt xem ($inc nguyên tử) |
(Thích / bình luận / xoá reel dùng lại API bài viết.)

### Tìm kiếm — `/api/search`
| Phương thức & đường dẫn | Chức năng |
|---|---|
| `GET /?q=&type=all\|people\|groups\|pages\|posts` | Tìm tổng hợp, lọc theo quyền xem, xếp theo quan hệ, kèm `reasons`; `all` mỗi loại 5 kết quả, một loại tối đa 20 (`limit` / `skip`) |

### Báo cáo vi phạm — `/api/reports`
| Phương thức & đường dẫn | Chức năng |
|---|---|
| `POST /` | Báo cáo bài viết / bình luận / người dùng / nhóm / trang (lý do + mô tả); 409 nếu đã báo cáo, 400 nếu tự báo cáo, 404 nếu không tồn tại |

### Quản trị — `/api/admin` (🛡️ chỉ quản trị viên; người thường 403)
| Phương thức & đường dẫn | Chức năng |
|---|---|
| `GET /stats` · `GET /audit-logs` | Số liệu toàn hệ thống · nhật ký quản trị (phân trang) |
| `GET /users?q=&filter=` | Danh sách người dùng (kèm email), tìm / lọc admin · user · online · banned |
| `PATCH /users/:id/ban` · `PATCH /users/:id/role` | Khoá / mở khoá (lý do, ngắt realtime) · cấp / thu hồi quyền quản trị |
| `GET /posts?kind=&q=` · `GET /comments?q=` · `GET /groups?q=` · `GET /pages?q=` | Danh sách nội dung để kiểm duyệt |
| `DELETE /posts\|comments\|groups\|pages/:id` | Gỡ nội dung vi phạm (xoá dây chuyền, báo chủ nội dung) |
| `GET /reports?status=&q=` · `PATCH /reports/:id` | Báo cáo (kèm số chờ xử lý) · xử lý (`resolved` / `dismissed`, ghi chú, `removeContent`) |
| `GET /announcements` · `POST /announcements` · `DELETE /announcements/:id` | Thông báo hệ thống tới mọi tài khoản đang hoạt động |

### Khác
`GET /api/health` — kiểm tra sức khoẻ (dùng khi deploy).

## 2.2 Realtime — Socket.IO (`server/socketServer.ts`)
- Xác thực JWT lúc kết nối; mỗi người một phòng `user:<id>`.
- **Server → client:** `message:new`, `message:delivered`, `typing`, `presence:update`, `notification:new`, `post:new` / `post:update` / `post:delete`, `comment:new` / `comment:delete`, `story:new` / `story:delete`, `friend-request:rejected` / `friend-request:cancelled`, `friend:removed`.
- **Client → server:** `typing`, `message:delivered`.
- Online / offline theo số kết nối (nhiều tab chỉ offline khi đóng tab cuối); sự kiện của mỗi socket được xử lý tuần tự để không đảo thứ tự.

## 2.3 Dữ liệu (`server/models/`)
| Model | Lưu gì |
|---|---|
| `User` | Hồ sơ, mật khẩu băm, khung avatar, liên kết mạng xã hội, chặn, trạng thái online, xác minh email (mã băm + hạn) |
| `Post` | Nội dung, ảnh / video, quyền riêng tư, hashtag, vị trí, gắn thẻ, cảm xúc, lịch sử sửa, ghim, tắt bình luận, người ẩn, người lưu; thêm `group` + `groupStatus` (bài nhóm, luôn `only_me` để mọi đường cũ tự đóng), `page` (bài của trang), `kind = reel` + lượt xem |
| `Comment` | Nội dung, ảnh, cha–con, gắn thẻ, cảm xúc, `editedAt` |
| `Story` | Chữ / ảnh, nền, quyền xem, người xem, cảm xúc, hạn 24 giờ |
| `FriendRequest` · `Friendship` · `Follow` | Lời mời (không trùng), quan hệ bạn bè, quan hệ theo dõi |
| `Conversation` · `Message` | Hội thoại 1-1 / nhóm, biệt danh, màu chủ đề; tin nhắn, thu hồi, "xóa với tôi", đã nhận / đã xem, cảm xúc |
| `Group` · `GroupMember` · `GroupReport` | Nhóm (quyền riêng tư, nội quy, câu hỏi, duyệt bài, số thành viên) · thành viên (vai trò, trạng thái chờ duyệt, câu trả lời) · báo cáo bài |
| `Page` · `PageFollow` | Trang (danh mục, chủ trang, quản trị viên, số người theo dõi) · lượt theo dõi trang |
| `Notification` | Thông báo kèm người gây ra, loại, liên kết tới bài / hồ sơ (`targetType: system` = thông báo hệ thống) |
| `Report` · `Announcement` · `AuditLog` | Báo cáo vi phạm gửi quản trị hệ thống · thông báo hệ thống · nhật ký hành động quản trị (chỉ ghi thêm) |

## 2.4 Dịch vụ & bảo vệ dùng chung
| Tệp | Chức năng |
|---|---|
| `validation.ts` | Kiểm tra dữ liệu vào bằng Zod (độ dài, kiểu, id, loại cảm xúc, khung avatar, liên kết `http(s)`) |
| `jwtAuth.ts` | Tạo / đọc JWT cho API và Socket.IO |
| `app.ts` | Dựng Express: giới hạn tốc độ, chống NoSQL injection, trình xử lý lỗi (id sai → 400, trùng khoá → 409, JSON hỏng → 400, không treo) |
| `email.ts` | Gửi email xác minh / đặt lại mật khẩu (SMTP, cấu hình qua `.env`) |
| `groupRules.ts` | Luật quyền của nhóm: ai xem / tương tác được bài nhóm, quản trị viên, phát realtime riêng cho thành viên nhóm |
| `hashtags.ts` · `pagination.ts` | Trích hashtag · chuẩn hoá `limit` / `skip` |
| `formatResponse.ts` | Chuẩn hoá dữ liệu trả về (không lộ mật khẩu / mã) |
| `createNotification.ts` | Tạo thông báo và đẩy realtime |

---

# PHẦN 3 — VẬN HÀNH & CHẤT LƯỢNG
| Phần | Nội dung |
|---|---|
| Triển khai (`deploy/`) | Cài VPS Windows, HTTPS, cấu hình Nginx, deploy bằng PM2, runner GitHub self-hosted (`.github/workflows/deploy.yml` chạy khi push `main`) |
| CI (`.github/workflows/test.yml`) | Typecheck + lint + test kèm độ phủ cho mỗi lần push / pull request |
| Test (`tests/`) | Hơn 3600 test Vitest: API + realtime (supertest, socket.io-client, MongoDB tạm) và giao diện (Testing Library + backend giả); ngưỡng độ phủ tối thiểu |
| Dữ liệu demo (`db/`) | `seed-demo.ts`, `export-json.ts`, `import-json.ts`; Postman collection |
