import mongoose, { Schema } from 'mongoose';

// Model Story (tin 24 giờ): dạng ảnh hoặc dạng chữ trên nền màu, kèm danh sách người đã xem.

const storySchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['image', 'text'], required: true },
    privacy: { type: String, enum: ['public', 'friends'], default: 'public' },
    mediaUrl: String,
    textContent: String,
    backgroundGradient: String,
    expiresAt: { type: Date, required: true },
    viewers: [{ user: { type: Schema.Types.ObjectId, ref: 'User' }, viewedAt: { type: Date, default: Date.now }, _id: false }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Index TTL: MongoDB tự động XOÁ story khi tới thời điểm expiresAt
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
storySchema.index({ user: 1, createdAt: -1 });

export const StoryModel = mongoose.models.Story || mongoose.model('Story', storySchema);
