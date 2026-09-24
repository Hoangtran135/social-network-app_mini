import express, { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireAuth } from '../jwtAuth';

// Upload ảnh / video:
// - POST /api/upload (phải đăng nhập): nhận 1 tệp ở trường "file", lưu vào thư mục uploads/, trả về { url, name, size }
// - serveUploads: phục vụ các tệp đã upload tại đường dẫn /uploads/<tên tệp>

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'video/quicktime'];

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    // Đặt tên mới = thời gian + số ngẫu nhiên + đuôi gốc (tránh trùng tên và tên tệp độc hại)
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) =>
    ALLOWED_TYPES.includes(file.mimetype) ? cb(null, true) : cb(new Error('Loại file không được hỗ trợ.')),
});

export const uploadRouter = Router();

uploadRouter.post('/', requireAuth, (req, res) => {
  upload.single('file')(req, res, (err) => {
    if (err || !req.file) return res.status(400).json({ error: err?.message || 'Không có file hợp lệ.' });
    res.json({ url: `/uploads/${req.file.filename}`, name: req.file.originalname, size: req.file.size });
  });
});

// "nosniff": không cho trình duyệt tự đoán loại tệp (chống chạy tệp độc hại giả làm ảnh)
export const serveUploads = express.static(UPLOADS_DIR, {
  setHeaders: (res) => res.setHeader('X-Content-Type-Options', 'nosniff'),
});
