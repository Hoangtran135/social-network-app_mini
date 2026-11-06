import React, { useState } from 'react';
import { DialogShell } from '../ui';

// Hộp thoại nhập một đoạn ghi chú / lý do rồi xác nhận (khoá tài khoản, xử lý báo cáo...). Ghi chú không bắt buộc, tối đa 500 ký tự.

export const ReasonDialog: React.FC<{
  title: string;
  description?: string;
  label: string;
  submitLabel: string;
  danger?: boolean;
  busy?: boolean;
  onSubmit: (text: string) => void;
  onClose: () => void;
}> = ({ title, description, label, submitLabel, danger, busy, onSubmit, onClose }) => {
  const [text, setText] = useState('');
  return (
    <DialogShell label={title} title={title} onClose={onClose}>
      {description && <p className="text-xs text-slate-500 mb-3">{description}</p>}
      <textarea autoFocus rows={3} maxLength={500} value={text} onChange={(e) => setText(e.target.value)} aria-label={label} placeholder={label} className="input resize-none" />
      <div className="flex gap-2 mt-3">
        <button onClick={onClose} className="btn-secondary flex-1">
          Hủy
        </button>
        <button onClick={() => onSubmit(text.trim())} disabled={busy} className={`${danger ? 'btn-primary !bg-rose-600 hover:!bg-rose-700' : 'btn-primary'} flex-1`}>
          {submitLabel}
        </button>
      </div>
    </DialogShell>
  );
};
