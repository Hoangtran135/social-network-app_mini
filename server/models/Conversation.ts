import mongoose, { Schema } from 'mongoose';

// Model Hội thoại: chat 1-1 hoặc nhóm chat, danh sách thành viên và biệt danh của từng người.

const conversationSchema = new Schema(
  {
    isGroup: { type: Boolean, default: false },
    // name, avatar: chỉ dùng cho nhóm chat
    name: String,
    avatar: String,
    participants: [{ type: Schema.Types.ObjectId, ref: 'User', required: true }],
    // Biệt danh: { idNgườiDùng: "biệt danh" }
    nicknames: { type: Map, of: String, default: {} },
  },
  // updatedAt = lần cuối có tin nhắn, dùng để xếp hội thoại mới nhất lên đầu
  { timestamps: { createdAt: false, updatedAt: true } }
);

conversationSchema.index({ participants: 1, updatedAt: -1 });

export const ConversationModel = mongoose.models.Conversation || mongoose.model('Conversation', conversationSchema);
