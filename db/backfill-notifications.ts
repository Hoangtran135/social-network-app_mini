// Nạp biến môi trường từ .env để dùng đúng database của app (MONGODB_URI)
import 'dotenv/config';
import mongoose from 'mongoose';
import { NotificationModel } from '../server/models/Notification';
import { CommentModel } from '../server/models/Comment';

// Bổ sung `commentId` cho các thông báo bình luận / gắn thẻ trong bình luận TẠO TRƯỚC khi có tính năng "bấm thông báo → cuộn tới đúng bình luận".
// Ghép theo: cùng người bình luận (actor), cùng bài (targetId), bình luận có sau thông báo ≤ vài giây. Chạy một lần:  npx tsx db/backfill-notifications.ts

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/social-network-app';
const WINDOW_MS = 5000;

async function main() {
  await mongoose.connect(MONGODB_URI);
  const pending = await NotificationModel.find({
    commentId: { $exists: false },
    targetType: 'post',
    $or: [{ type: 'comment' }, { type: 'system', content: 'đã gắn thẻ bạn trong một bình luận.' }],
  }).select('actor targetId createdAt');

  let fixed = 0;
  for (const n of pending) {
    const comment = await CommentModel.findOne({ post: n.targetId, author: n.actor, createdAt: { $gte: new Date(n.createdAt.getTime() - WINDOW_MS), $lte: new Date(n.createdAt.getTime() + WINDOW_MS) } }).select('_id');
    if (!comment) continue;
    await NotificationModel.updateOne({ _id: n._id }, { commentId: String(comment._id) });
    fixed++;
  }
  console.log(`Đã bổ sung commentId cho ${fixed}/${pending.length} thông báo.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
