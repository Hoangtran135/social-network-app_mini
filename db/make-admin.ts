// Nạp biến môi trường từ .env để dùng đúng database của app (MONGODB_URI)
import 'dotenv/config';
import mongoose from 'mongoose';
import { UserModel } from '../server/models/User';

// Cấp / thu hồi quyền quản trị hệ thống cho một tài khoản theo email.
//   npm run make-admin -- email@vd.vn            → cấp quyền admin
//   npm run make-admin -- email@vd.vn --revoke   → thu hồi (về người dùng thường)

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/social-network-app';

async function main() {
  const [email, flag] = process.argv.slice(2);
  if (!email) throw new Error('Thiếu email. Dùng: npm run make-admin -- email@vd.vn [--revoke]');
  await mongoose.connect(MONGODB_URI);
  const role = flag === '--revoke' ? 'user' : 'admin';
  const user = await UserModel.findOneAndUpdate({ email: email.toLowerCase() }, { role }, { returnDocument: 'after' });
  if (!user) throw new Error(`Không tìm thấy tài khoản có email ${email}`);
  console.log(`${user.name} (${user.email}) → ${role === 'admin' ? 'đã là quản trị viên' : 'đã thu hồi quyền quản trị'}`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
