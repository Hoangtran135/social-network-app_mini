import mongoose, { Schema } from 'mongoose';

// Model Người dùng: thông tin tài khoản, hồ sơ cá nhân, trạng thái online và danh sách người đã chặn.

const userSchema = new Schema(
  {
    name: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    // Mật khẩu đã băm bằng bcrypt, KHÔNG lưu mật khẩu gốc
    passwordHash: { type: String, required: true },
    avatar: { type: String, default: '' },
    coverImage: String,
    bio: String,
    workplace: String,
    education: String,
    location: String,
    website: String,
    isOnline: { type: Boolean, default: false },
    lastActive: Date,
    // Dùng cho "Quên mật khẩu": bản băm của mã trong email và thời điểm mã hết hạn
    resetTokenHash: String,
    resetTokenExpires: Date,
    blockedUsers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  // Tự lưu thời điểm tạo tài khoản vào trường joinDate
  { timestamps: { createdAt: 'joinDate', updatedAt: false } }
);

export const UserModel = mongoose.models.User || mongoose.model('User', userSchema);
