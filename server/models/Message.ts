import mongoose, { Schema } from 'mongoose';

// Model Tin nhắn trong một hội thoại: nội dung, tệp đính kèm, bài viết được chia sẻ, ai đã đọc, cảm xúc.

const messageSchema = new Schema(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
    // Tin nhắn hệ thống (vd "A đã đổi biệt danh...") không có người gửi
    sender: { type: Schema.Types.ObjectId, ref: 'User' },
    kind: { type: String, enum: ['text', 'system'], default: 'text' },
    content: { type: String, default: '' },
    sharedPostId: { type: Schema.Types.ObjectId, ref: 'Post' },
    attachments: [{ type: { type: String, enum: ['image', 'file'] }, url: String, name: String, size: String, _id: false }],
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    // Thu hồi = không xoá bản ghi, chỉ đánh dấu và xoá nội dung
    isRecalled: { type: Boolean, default: false },
    // Cảm xúc: { idNgườiDùng: "emoji" } — mỗi người một cảm xúc
    reactions: { type: Map, of: String, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

messageSchema.index({ conversation: 1, createdAt: 1 });

export const MessageModel = mongoose.models.Message || mongoose.model('Message', messageSchema);
