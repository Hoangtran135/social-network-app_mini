import mongoose from 'mongoose';

// Kết nối tới MongoDB. Địa chỉ lấy từ biến MONGODB_URI trong file .env.

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/social-network-app-mini';
  await mongoose.connect(uri, { maxPoolSize: Number(process.env.MONGO_POOL_SIZE) || 100 });
  console.log(`==> Connected to MongoDB at ${uri}`);
}
