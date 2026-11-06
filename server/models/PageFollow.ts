import mongoose, { Schema } from 'mongoose';

// Model Theo dõi Trang: người dùng (user) theo dõi một trang (page). Mỗi người chỉ theo dõi một trang một lần.

const pageFollowSchema = new Schema(
  {
    page: { type: Schema.Types.ObjectId, ref: 'Page', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

pageFollowSchema.index({ page: 1, user: 1 }, { unique: true });
pageFollowSchema.index({ user: 1, createdAt: -1 });

export const PageFollowModel = mongoose.models.PageFollow || mongoose.model('PageFollow', pageFollowSchema);
