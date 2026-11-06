import mongoose, { Schema } from 'mongoose';

// Model Trang (fanpage) cho thương hiệu / doanh nghiệp / người nổi tiếng / cộng đồng: tên, danh mục, mô tả, ảnh, chủ trang,
// danh sách quản trị viên và số người theo dõi (cập nhật bằng $inc khi có người theo dõi / bỏ theo dõi).

export const PAGE_CATEGORIES = ['brand', 'business', 'community', 'public_figure', 'entertainment', 'education', 'nonprofit', 'other'] as const;

const pageSchema = new Schema(
  {
    name: { type: String, required: true },
    category: { type: String, enum: PAGE_CATEGORIES, default: 'other' },
    description: { type: String, default: '' },
    website: String,
    address: String,
    avatar: String,
    cover: String,
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    // Quản trị viên (không gồm chủ trang): được đăng bài, sửa trang, xoá bài của trang
    admins: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    followersCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

pageSchema.index({ name: 1 });
pageSchema.index({ followersCount: -1, createdAt: -1 });
pageSchema.index({ owner: 1 });
pageSchema.index({ admins: 1 });

export const PageModel = mongoose.models.Page || mongoose.model('Page', pageSchema);
