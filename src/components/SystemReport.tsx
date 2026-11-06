import React, { useState } from 'react';
import { api } from '../utils/api';
import { ReportReason, ReportTarget } from '../types';
import { REPORT_REASON_LABELS, REPORT_TARGET_LABELS } from '../utils/adminLabels';
import { useManageAction } from '../hooks/useManageAction';
import { DialogShell } from './ui';

// Báo cáo vi phạm tới QUẢN TRỊ HỆ THỐNG (khác báo cáo bài trong nhóm — gửi cho quản trị viên nhóm).
// Dùng cho: bài viết, reel, bình luận, người dùng, nhóm, trang. Server chặn báo cáo trùng và tự báo cáo nội dung của chính mình.

/** Hộp thoại chọn lý do (+ mô tả) rồi gửi. Gửi xong (hoặc đã báo cáo rồi) thì toast và đóng. */
export const SystemReportDialog: React.FC<{ targetType: ReportTarget; targetId: string; onClose: () => void }> = ({ targetType, targetId, onClose }) => {
  const [reason, setReason] = useState<ReportReason>('spam');
  const [description, setDescription] = useState('');
  const { act, busy } = useManageAction();
  const label = REPORT_TARGET_LABELS[targetType].toLowerCase();

  const submit = async () => {
    if (await act(() => api.post('/reports', { targetType, targetId, reason, description: description.trim() }), 'Đã gửi báo cáo. Cảm ơn bạn đã giúp cộng đồng an toàn hơn!')) onClose();
  };

  return (
    <DialogShell label={`Báo cáo ${label}`} title={`Báo cáo ${label}`} onClose={onClose}>
      <p className="text-xs text-slate-500 mb-3">Báo cáo được gửi riêng cho quản trị viên hệ thống. Người bị báo cáo sẽ không biết ai đã báo cáo.</p>
      <fieldset className="space-y-1 mb-3">
        <legend className="field-label mb-1.5">Lý do</legend>
        {(Object.keys(REPORT_REASON_LABELS) as ReportReason[]).map((key) => (
          <label key={key} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm text-slate-700">
            <input type="radio" name="report-reason" checked={reason === key} onChange={() => setReason(key)} className="accent-blue-600" />
            {REPORT_REASON_LABELS[key]}
          </label>
        ))}
      </fieldset>
      <textarea rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả thêm (không bắt buộc)" aria-label="Mô tả thêm" className="input resize-none" />
      <button onClick={submit} disabled={busy} className="btn-primary w-full mt-3">
        Gửi báo cáo
      </button>
    </DialogShell>
  );
};

/** Nút bấm mở hộp thoại báo cáo. className/children do nơi dùng quyết định để hợp với từng bố cục. */
export const ReportButton: React.FC<{ targetType: ReportTarget; targetId: string; className?: string; label?: string; children: React.ReactNode }> = ({ targetType, targetId, className, label = 'Báo cáo vi phạm', children }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={label} title={label} className={className}>
        {children}
      </button>
      {open && <SystemReportDialog targetType={targetType} targetId={targetId} onClose={() => setOpen(false)} />}
    </>
  );
};
