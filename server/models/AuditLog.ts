import mongoose, { Schema } from 'mongoose';

// Model Nhật ký hành động quản trị: ai (admin) đã làm gì (action) với đối tượng nào (target), kèm chi tiết. Chỉ ghi thêm, không sửa / xoá qua API.

const auditLogSchema = new Schema(
  {
    admin: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true }, // vd 'user.ban', 'user.unban', 'user.role', 'post.delete', 'report.resolve', 'announcement.create'
    targetType: { type: String, enum: ['user', 'post', 'comment', 'group', 'page', 'report', 'announcement'], required: true },
    targetId: String,
    details: Schema.Types.Mixed,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });

export const AuditLogModel = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
