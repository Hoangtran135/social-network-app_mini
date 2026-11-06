import mongoose, { Schema } from 'mongoose';

// Model Thành viên nhóm: một người trong một nhóm, với vai trò (owner / admin / member) và trạng thái
// (active = đã là thành viên, pending = đang chờ duyệt). "rank" (0 chủ nhóm, 1 quản trị viên, 2 thành viên) để sắp xếp danh sách.

export const ROLE_RANK = { owner: 0, admin: 1, member: 2 } as const;

const groupMemberSchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], default: 'member' },
    rank: { type: Number, default: 2 },
    status: { type: String, enum: ['active', 'pending'], default: 'active' },
    // Câu trả lời cho các câu hỏi xin vào nhóm
    answers: [{ question: String, answer: String, _id: false }],
  },
  { timestamps: true }
);

// Một người chỉ có một bản ghi trong mỗi nhóm
groupMemberSchema.index({ group: 1, user: 1 }, { unique: true });
groupMemberSchema.index({ group: 1, status: 1, rank: 1, createdAt: 1 });
groupMemberSchema.index({ user: 1, status: 1 });

export const GroupMemberModel = mongoose.models.GroupMember || mongoose.model('GroupMember', groupMemberSchema);
