import mongoose, { Schema } from 'mongoose';

// Model Báo cáo vi phạm: người dùng báo cáo một bài viết / bình luận / người dùng / nhóm / trang cho quản trị hệ thống xử lý.
// (Báo cáo bài viết TRONG nhóm gửi cho quản trị viên nhóm là model GroupReport — hai luồng khác nhau.)

export const REPORT_TARGETS = ['post', 'comment', 'user', 'group', 'page'] as const;
export const REPORT_REASONS = ['spam', 'harassment', 'hate', 'violence', 'nudity', 'fake', 'other'] as const;

const reportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    targetType: { type: String, enum: REPORT_TARGETS, required: true },
    targetId: { type: String, required: true },
    // Tên / trích đoạn đối tượng tại thời điểm báo cáo (vẫn xem được dù nội dung sau đó bị xoá)
    targetName: { type: String, default: '' },
    reason: { type: String, enum: REPORT_REASONS, required: true },
    description: { type: String, default: '' },
    status: { type: String, enum: ['pending', 'resolved', 'dismissed'], default: 'pending' },
    resolutionNote: String,
    handledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    handledAt: Date,
  },
  { timestamps: true }
);

// Mỗi người chỉ báo cáo một đối tượng một lần
reportSchema.index({ reporter: 1, targetType: 1, targetId: 1 }, { unique: true });
reportSchema.index({ status: 1, createdAt: -1 });
reportSchema.index({ targetType: 1, targetId: 1 });

export const ReportModel = mongoose.models.Report || mongoose.model('Report', reportSchema);
