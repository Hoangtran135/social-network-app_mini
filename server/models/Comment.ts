import mongoose, { Schema } from 'mongoose';

// Model Bình luận của một bài viết. Bình luận có "parent" là câu trả lời cho một bình luận khác.

const commentSchema = new Schema(
  {
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    content: { type: String, default: '' },
    image: String,
    taggedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    likes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    parent: { type: Schema.Types.ObjectId, ref: 'Comment' },
  },
  { timestamps: true }
);

commentSchema.index({ post: 1, createdAt: 1 });

export const CommentModel = mongoose.models.Comment || mongoose.model('Comment', commentSchema);
