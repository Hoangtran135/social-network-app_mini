import mongoose, { Schema } from 'mongoose';

// Model Bài viết: nội dung, ảnh/video, quyền riêng tư, người được gắn thẻ, cảm xúc, người đã lưu.

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
  },
  { timestamps: true }
);

postSchema.index({ createdAt: -1 });
postSchema.index({ author: 1, createdAt: -1 });
postSchema.index({ wallOwner: 1 });

export const PostModel = mongoose.models.Post || mongoose.model('Post', postSchema);
