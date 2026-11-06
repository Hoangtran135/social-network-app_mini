import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { api } from '../../utils/api';
import { Page } from '../../types';
import { useConfirm } from '../../context/ConfirmDialogContext';
import { useManageAction } from '../../hooks/useManageAction';
import { PageSettings } from './admin/PageSettingsSection';
import { PageAdmins } from './admin/PageAdminsSection';
import { PageFollowers } from './admin/PageFollowersSection';

// Tab "Quản trị" của Trang (chủ trang + quản trị viên): thông tin trang, quản trị viên, người theo dõi, xoá trang.
// Mỗi mục là một file riêng trong thư mục admin/.

export const PageAdminTab: React.FC<{ page: Page; reload: () => void }> = ({ page, reload }) => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { act, busy } = useManageAction();
  return (
    <div className="space-y-5">
      <PageSettings page={page} reload={reload} />
      <PageAdmins page={page} reload={reload} />
      <PageFollowers page={page} />
      {page.myRole === 'owner' && (
        <section className="card p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="section-title">Xoá trang</h3>
            <p className="text-xs text-slate-500">Toàn bộ bài viết và người theo dõi của trang sẽ bị xoá vĩnh viễn.</p>
          </div>
          <button
            disabled={busy}
            onClick={async () => {
              if (!(await confirm(`Xoá trang "${page.name}"? Hành động này không thể hoàn tác.`))) return;
              if (await act(() => api.delete(`/pages/${page.id}`), 'Đã xoá trang.')) navigate('/pages');
            }}
            className="btn-secondary !text-rose-600 hover:!bg-rose-50"
          >
            <Trash2 className="w-4 h-4" /> Xoá trang
          </button>
        </section>
      )}
    </div>
  );
};
