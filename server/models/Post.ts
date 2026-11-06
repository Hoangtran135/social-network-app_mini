import mongoose, { Schema } from 'mongoose';

// Model Bài viết: nội dung, ảnh/video, quyền riêng tư, người được gắn thẻ, cảm xúc, người đã lưu,
// hashtag, lịch sử chỉnh sửa, trạng thái tắt bình luận và danh sách người đã ẩn bài.

const postSchema = new Schema(
  {
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Có giá trị khi bài được đăng lên tường (trang cá nhân) của người khác
    wallOwner: { type: Schema.Types.ObjectId, ref: 'User' },
    content: { type: String, default: '' },
    images: [String],
    video: String,
    privacy: { type: String, enum: ['public', 'friends', 'only_me'], default: 'public' },
    feeling: String,
    location: String,
    taggedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // Mỗi người chỉ có 1 cảm xúc trên một bài
    reactions: [
      {
        type: { type: String, enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry'], required: true },
        userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        _id: false,
      },
    ],
    savedBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // Lưu sẵn số bình luận để không phải đếm lại mỗi lần hiển thị
    commentsCount: { type: Number, default: 0 },
    sharesCount: { type: Number, default: 0 },
    pinned: { type: Boolean, default: false },
    // Thời điểm sửa nội dung gần nhất (để hiện "đã chỉnh sửa")
    editedAt: Date,
    // Các phiên bản nội dung TRƯỚC mỗi lần sửa (editedAt = thời điểm bị thay thế)
    editHistory: [{ content: String, editedAt: Date, _id: false }],
    // #hashtag trong nội dung (chữ thường), tự tính lại mỗi khi nội dung đổi
    hashtags: [String],
    // Chủ bài tắt bình luận: bình luận cũ vẫn xem được nhưng không ai viết thêm được
    commentsDisabled: { type: Boolean, default: false },
    // Những người đã chọn "Ẩn bài viết / không quan tâm" → bài không hiện ở bảng tin của họ
    hiddenBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // Bài đăng trong nhóm: có giá trị 'group'. Bài nhóm luôn có privacy = 'only_me' để MỌI đường cũ (bảng tin, hashtag, chia sẻ, realtime...) mặc định ĐÓNG;
    // quyền xem thật sự do thành viên nhóm quyết định (server/groupRules.ts). groupStatus: pending = đang chờ quản trị viên duyệt.
    group: { type: Schema.Types.ObjectId, ref: 'Group' },
    groupStatus: { type: String, enum: ['approved', 'pending'], default: 'approved' },
    // Bài đăng với tư cách một Trang (fanpage): author = quản trị viên đã đăng, page = trang. Luôn công khai.
    page: { type: Schema.Types.ObjectId, ref: 'Page' },
    // 'reel' = video ngắn (chỉ hiện ở mục Reels, không lên bảng tin / trang cá nhân); mặc định là bài viết thường
    kind: { type: String, enum: ['post', 'reel'], default: 'post' },
    viewsCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

postSchema.index({ createdAt: -1 });
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ wallOwner: 1 });
postSchema.index({ hashtags: 1, createdAt: -1 });
postSchema.index({ group: 1, groupStatus: 1, createdAt: -1 });
postSchema.index({ page: 1, createdAt: -1 });
postSchema.index({ kind: 1, createdAt: -1 });

export const PostModel = mongoose.models.Post || mongoose.model('Post', postSchema);
