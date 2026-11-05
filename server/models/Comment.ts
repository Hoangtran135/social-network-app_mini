import mongoose, { Schema } from 'mongoose';

// Model Bình luận của một bài viết. Bình luận có "parent" là câu trả lời cho một bình luận khác.

const commentSchema = new Schema(
  {
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '' },
    image: String,
    taggedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // "Thích" (cảm xúc like) lưu ở likes; các cảm xúc khác (love, haha...) lưu ở reactions. Mỗi người chỉ có MỘT cảm xúc trên một bình luận.
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    reactions: [{ type: { type: String, enum: ['love', 'haha', 'wow', 'sad', 'angry'], required: true }, userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, _id: false }],
    // Thời điểm sửa gần nhất (để hiện "đã chỉnh sửa")
    editedAt: Date,
    parent: { type: Schema.Types.ObjectId, ref: 'Comment' },
  },
  { timestamps: true }
);

commentSchema.index({ post: 1, createdAt: 1 });

export const CommentModel = mongoose.models.Comment || mongoose.model('Comment', commentSchema);
