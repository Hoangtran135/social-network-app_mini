import mongoose, { Schema } from 'mongoose';

// Model Thông báo: ai (actor) đã làm gì liên quan tới người nhận (user), bấm vào thì mở targetId.

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: ['like', 'comment', 'friend_request', 'friend_accept', 'system'], required: true },
    content: { type: String, required: true },
    targetId: String,
    targetType: { type: String, enum: ['post', 'profile', 'group', 'page', 'system'] },
    // Bấm thông báo thì mở ĐÚNG chỗ: commentId = bình luận cần cuộn tới; focus = mục cần cuộn tới ở tab Quản trị của nhóm ('join-requests' | 'pending-posts' | 'reports')
    commentId: String,
    focus: String,
    isRead: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ user: 1, createdAt: -1 });

export const NotificationModel = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);
