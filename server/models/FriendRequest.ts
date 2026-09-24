import mongoose, { Schema } from 'mongoose';

// Model Lời mời kết bạn đang chờ xử lý. Chấp nhận thì lời mời bị xoá và tạo một Friendship.

const friendRequestSchema = new Schema(
  {
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    receiver: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Một người không thể gửi 2 lời mời tới cùng một người
friendRequestSchema.index({ sender: 1, receiver: 1 }, { unique: true });
friendRequestSchema.index({ receiver: 1 });

export const FriendRequestModel = mongoose.models.FriendRequest || mongoose.model('FriendRequest', friendRequestSchema);
