import mongoose from 'mongoose';
import { EJSON } from 'bson';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/social-network-app';
const IN_DIR = process.env.EXPORT_DIR || path.join(__dirname, 'export');
const DROP_EXISTING = process.env.DROP_EXISTING !== 'false';

/** Nhập dữ liệu từ các file JSON vào MongoDB; có thể xoá dữ liệu cũ trước khi nhập. */
async function main() {
  if (!fs.existsSync(IN_DIR)) {
    console.error(`Không tìm thấy thư mục export: ${IN_DIR}`);
    process.exit(1);
  }

  await mongoose.connect(MONGODB_URI);
  console.log(`Connected to ${MONGODB_URI}`);
  console.log(DROP_EXISTING ? 'Chế độ: XOÁ dữ liệu cũ trước khi import' : 'Chế độ: GIỮ dữ liệu cũ, chỉ chèn thêm');

  const files = fs.readdirSync(IN_DIR).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const name = path.basename(file, '.json');
    const raw = fs.readFileSync(path.join(IN_DIR, file), 'utf-8');
    const docs = EJSON.parse(raw) as mongoose.mongo.OptionalId<mongoose.mongo.Document>[];

    if (DROP_EXISTING) {
      await mongoose.connection.db!.collection(name).deleteMany({});
    }
    if (docs.length > 0) {
      await mongoose.connection.db!.collection(name).insertMany(docs);
    }
    console.log(`  ${name}: đã import ${docs.length} documents`);
  }

  console.log('\n✅ Import xong.');
  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
