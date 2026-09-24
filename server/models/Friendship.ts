import mongoose, { Schema } from 'mongoose';

// Model Quan hệ bạn bè giữa 2 người (userA, userB). Không phân biệt ai là A, ai là B,
// nên khi tìm bạn bè của một người phải tìm ở cả hai vị trí.

const friendshipSchema = new Schema(
  {
    userA: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userB: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

friendshipSchema.index({ userA: 1 });
friendshipSchema.index({ userB: 1 });

export const FriendshipModel = mongoose.models.Friendship || mongoose.model('Friendship', friendshipSchema);
