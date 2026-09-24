import mongoose from 'mongoose';
import { EJSON } from 'bson';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/social-network-app';
const OUT_DIR = process.env.EXPORT_DIR || path.join(__dirname, 'export');

/** Xuất toàn bộ các collection trong MongoDB ra file JSON (định dạng EJSON) để sao lưu. */
async function main() {
  await mongoose.connect(MONGODB_URI);
  console.log(`Connected to ${MONGODB_URI}`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const collections = await mongoose.connection.db!.listCollections().toArray();
  for (const { name } of collections) {
    const docs = await mongoose.connection.db!.collection(name).find({}).toArray();
    const file = path.join(OUT_DIR, `${name}.json`);
    fs.writeFileSync(file, EJSON.stringify(docs, undefined, 2), 'utf-8');
    console.log(`  ${name}: ${docs.length} documents -> ${file}`);
  }

  console.log(`\n✅ Export xong. Thư mục: ${OUT_DIR}`);
  console.log('   Nén thư mục này (zip) rồi copy sang VPS, sau đó chạy db/import-json.ts trên VPS.');

  await mongoose.disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
