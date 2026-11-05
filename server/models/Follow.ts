import mongoose, { Schema } from 'mongoose';

// Model Theo dõi: "follower" theo dõi "following" mà KHÔNG cần kết bạn (một chiều).

const followSchema = new Schema(
  {
    follower: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    following: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);
// Mỗi người chỉ theo dõi một người khác tối đa MỘT lần
followSchema.index({ follower: 1, following: 1 }, { unique: true });
followSchema.index({ following: 1 });

export const FollowModel = mongoose.models.Follow || mongoose.model('Follow', followSchema);
