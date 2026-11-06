import React from 'react';
import { ShieldCheck } from 'lucide-react';
import { NotificationItem } from '../types';
import { isSystemNotification } from '../utils/notificationText';

// Cách hiển thị MỘT thông báo (menu thông báo trên Navbar, trang Thông báo): thông báo hệ thống hiện "Hệ thống" và biểu tượng khiên thay vì tên quản trị viên.

/** Câu thông báo: tên người (hoặc "Hệ thống") in đậm rồi tới nội dung. */
export const NotificationText: React.FC<{ n: NotificationItem }> = ({ n }) =>
  isSystemNotification(n) ? (
    <>
      <b>Hệ thống:</b> {n.content}
    </>
  ) : (
    <>
      <b>{n.actor.name}</b> {n.content}
    </>
  );

/** Ảnh đại diện của người gây ra thông báo (hoặc biểu tượng khiên cho thông báo hệ thống). */
export const NotificationAvatar: React.FC<{ n: NotificationItem; className: string }> = ({ n, className }) =>
  isSystemNotification(n) ? (
    <div aria-hidden="true" className={`${className} bg-blue-100 text-blue-600 flex items-center justify-center`}>
      <ShieldCheck className="w-1/2 h-1/2" />
    </div>
  ) : (
    <img src={n.actor.avatar} alt="" loading="lazy" className={`${className} object-cover`} />
  );
