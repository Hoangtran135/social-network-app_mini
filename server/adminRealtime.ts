import { UserModel } from './models/User';
import { emitToUsers } from './socketServer';

// Đẩy sự kiện realtime tới mọi quản trị hệ thống (vd báo cáo mới để cập nhật số đếm ở menu quản trị).

export async function emitToAdmins(event: string, payload: unknown) {
  const admins = await UserModel.find({ role: 'admin', banned: { $ne: true } }).select('_id').lean();
  emitToUsers(admins.map((a: { _id: unknown }) => String(a._id)), event, payload);
}
