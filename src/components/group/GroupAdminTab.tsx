import React from 'react';
import { Group } from '../../types';
import { JoinRequests } from './admin/JoinRequestsSection';
import { PendingPosts } from './admin/PendingPostsSection';
import { Reports } from './admin/ReportsSection';
import { GroupSettings } from './admin/GroupSettingsSection';

// Tab "Quản trị" của trang nhóm (chủ nhóm + quản trị viên): yêu cầu tham gia, bài chờ duyệt, báo cáo và cài đặt nhóm.
// Mỗi mục là một file riêng trong thư mục admin/.

export const GroupAdminTab: React.FC<{ group: Group; reload: () => void }> = ({ group, reload }) => (
  <div className="space-y-5">
    <JoinRequests group={group} reload={reload} />
    <PendingPosts group={group} reload={reload} />
    <Reports group={group} reload={reload} />
    <GroupSettings group={group} reload={reload} />
  </div>
);
