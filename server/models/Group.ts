import mongoose, { Schema } from 'mongoose';

// Model Nhóm giao lưu (group): tên, mô tả, nội quy, quyền riêng tư (công khai / riêng tư), chủ nhóm,
// bật duyệt bài, câu hỏi xin vào nhóm (nhóm riêng tư) và số thành viên đang hoạt động (cập nhật bằng $inc).

const groupSchema = new Schema(
  {
    name: { type: String, required: true },
    description: { type: String, default: '' },
    rules: [String],
    privacy: { type: String, enum: ['public', 'private'], default: 'public' },
    avatar: String,
    cover: String,
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Bật: bài của thành viên thường phải được quản trị viên duyệt mới hiện (bài của chủ nhóm / quản trị viên tự duyệt)
    postApproval: { type: Boolean, default: false },
    joinQuestions: [String],
    membersCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

groupSchema.index({ name: 1 });
groupSchema.index({ createdAt: -1 });

export const GroupModel = mongoose.models.Group || mongoose.model('Group', groupSchema);
