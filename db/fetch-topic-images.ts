// Tải sẵn danh sách ảnh THẬT theo từ khoá từ Wikimedia Commons (miễn phí, ổn định, cho phép nhúng) và lưu vào db/seed-images.json.
// Script seed dùng file này để chọn ảnh đúng chủ đề; chỉ cần chạy lại khi thêm từ khoá mới:  npx tsx db/fetch-topic-images.ts

import fs from 'fs';
import path from 'path';
import { CITY_IMAGE_TAG, PAGE_IMAGE_TAG, TOPIC_DATA } from './seed-topics';

const PER_TAG = 12;
const OUT = path.join(process.cwd(), 'db', 'seed-images.json');

const tags = new Set<string>([...Object.values(TOPIC_DATA).flatMap((t) => [...t.imageTags, ...t.lineTags]), ...Object.values(PAGE_IMAGE_TAG), ...Object.values(CITY_IMAGE_TAG)]);

/** Một từ khoá có thể cần diễn giải để Commons tìm đúng (vd tên riêng không có nghĩa tiếng Anh). */
const QUERY: Record<string, string> = { hanoi: 'Hanoi street', saigon: 'Ho Chi Minh City', danang: 'Da Nang', dalat: 'Da Lat', hoian: 'Hoi An', terraces: 'Sapa rice terraces', mekong: 'Mekong Delta', pagoda: 'Hue pagoda', pine: 'Da Lat pine forest', lantern: 'Hoi An lantern', gamingpc: 'gaming computer', ssd: 'solid state drive', pomodoro: 'kitchen timer', mindmap: 'mind map', artificialintelligence: 'artificial intelligence robot', streetfood: 'street food Vietnam', kindergarten: 'kindergarten children', veterinary: 'veterinarian dog', baby: 'infant baby face', mother: 'mother and child', mentor: 'mentoring coaching', startup: 'startup company office', money: 'banknotes money', birthday: 'birthday cake', lemon: 'lemon tree fruit', watering: 'watering can garden', children: 'children playing', office: 'office workspace', family: 'family portrait', picnic: 'picnic park' };

async function search(tag: string): Promise<string[]> {
  const q = `${QUERY[tag] ?? tag} filetype:bitmap`;
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(q)}&gsrnamespace=6&gsrlimit=${PER_TAG * 2}&prop=imageinfo&iiprop=url|mime|size&iiurlwidth=800&format=json`;
  let res = await fetch(url, { headers: { 'User-Agent': 'SocialNetSeed/1.0 (educational demo)' } });
  // Bị giới hạn tốc độ (429) → chờ rồi thử lại, tối đa 6 lần
  for (let attempt = 1; res.status === 429 && attempt <= 6; attempt++) {
    await new Promise((r) => setTimeout(r, 5000 * attempt));
    res = await fetch(url, { headers: { 'User-Agent': 'SocialNetSeed/1.0 (educational demo)' } });
  }
  const data = (await res.json()) as { query?: { pages?: Record<string, { imageinfo?: { thumburl?: string; mime: string; width: number; height: number }[] }> } };
  const pages = Object.values(data.query?.pages ?? {});
  return pages
    .map((p) => p.imageinfo?.[0])
    .filter((i): i is NonNullable<typeof i> => !!i && i.mime === 'image/jpeg' && i.width >= 600 && i.width / i.height > 0.9 && i.width / i.height < 2 && !!i.thumburl)
    .map((i) => i.thumburl!)
    .slice(0, PER_TAG);
}

async function main() {
  const out: Record<string, string[]> = {};
  for (const tag of tags) {
    out[tag] = await search(tag).catch(() => []);
    console.log(`${tag}: ${out[tag].length} ảnh`);
    await new Promise((r) => setTimeout(r, 1500));
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  const empty = Object.entries(out).filter(([, v]) => v.length === 0).map(([k]) => k);
  console.log(empty.length ? `Từ khoá không có ảnh: ${empty.join(', ')}` : 'Mọi từ khoá đều có ảnh.');
}

main();
