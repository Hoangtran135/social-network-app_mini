import mongoose, { Schema } from 'mongoose';

// Model Thông báo hệ thống do quản trị viên gửi tới toàn bộ người dùng (đồng thời tạo một thông báo cho từng người).

const announcementSchema = new Schema(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: { type: String, enum: ['info', 'warning', 'alert'], default: 'info' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

announcementSchema.index({ createdAt: -1 });

export const AnnouncementModel = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);
