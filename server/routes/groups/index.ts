import { Router } from 'express';
import { requireAuth } from '../../jwtAuth';
import { registerGroupCore } from './core';
import { registerGroupMembers } from './members';
import { registerGroupPosts } from './posts';
import { registerGroupReports } from './reports';

// API nhóm giao lưu (/api/groups). Mỗi file con đăng ký các route của một nhóm nhiệm vụ:
//   core.ts     — danh sách, tạo, xem, sửa, xoá nhóm; tham gia / rời nhóm
//   members.ts  — thành viên: danh sách, duyệt / từ chối, đuổi, đổi vai trò, chuyển quyền chủ nhóm
//   posts.ts    — bài viết trong nhóm: danh sách, đăng, duyệt, từ chối, xoá
//   reports.ts  — báo cáo bài viết và xử lý báo cáo
// Phần dùng chung (nạp nhóm, kiểm tra vai trò, thông báo) nằm ở middleware.ts.

export const groupsRouter = Router();
groupsRouter.use(requireAuth);

// Thứ tự đăng ký có ý nghĩa: các đường dẫn cố định (/:id/members, /:id/posts...) đều dài hơn "/:id" nên không xung đột.
registerGroupCore(groupsRouter);
registerGroupMembers(groupsRouter);
registerGroupPosts(groupsRouter);
registerGroupReports(groupsRouter);
