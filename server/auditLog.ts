import { AuditLogModel } from './models/AuditLog';

export type AuditTarget = 'user' | 'post' | 'comment' | 'group' | 'page' | 'report' | 'announcement';

// Ghi nhật ký một hành động quản trị (gọi sau khi hành động thành công).

export const logAdminAction = (admin: string, action: string, targetType: AuditTarget, targetId: string, details?: Record<string, unknown>) =>
  AuditLogModel.create({ admin, action, targetType, targetId, details });
