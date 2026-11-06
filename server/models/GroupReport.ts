import mongoose, { Schema } from 'mongoose';

// Model Báo cáo bài viết trong nhóm: thành viên báo cáo một bài cho quản trị viên xử lý.

const groupReportSchema = new Schema(
  {
    group: { type: Schema.Types.ObjectId, ref: 'Group', required: true },
    post: { type: Schema.Types.ObjectId, ref: 'Post', required: true },
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, default: '' },
    status: { type: String, enum: ['open', 'resolved'], default: 'open' },
  },
  { timestamps: true }
);

// Mỗi người chỉ báo cáo một bài một lần
groupReportSchema.index({ post: 1, reporter: 1 }, { unique: true });
groupReportSchema.index({ group: 1, status: 1, createdAt: -1 });

export const GroupReportModel = mongoose.models.GroupReport || mongoose.model('GroupReport', groupReportSchema);
