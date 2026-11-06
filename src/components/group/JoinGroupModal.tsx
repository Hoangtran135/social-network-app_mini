import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Group } from '../../types';
import { useEscapeKey } from '../../hooks/useEscapeKey';

// Hộp thoại xin vào nhóm riêng tư có câu hỏi: phải trả lời tất cả câu hỏi rồi mới gửi yêu cầu.

export const JoinGroupModal: React.FC<{ group: Group; onSubmit: (answers: string[]) => void; onClose: () => void }> = ({ group, onSubmit, onClose }) => {
  const [answers, setAnswers] = useState<string[]>(group.joinQuestions.map(() => ''));
  useEscapeKey(onClose);
  const complete = answers.every((a) => a.trim());

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-label="Xin tham gia nhóm"
        onSubmit={(e) => {
          e.preventDefault();
          if (complete) onSubmit(answers.map((a) => a.trim()));
        }}
        className="animate-pop bg-white rounded-t-2xl sm:rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="section-title">Xin tham gia {group.name}</h3>
          <button type="button" aria-label="Đóng" onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-slate-500">Quản trị viên sẽ xem câu trả lời của bạn trước khi duyệt.</p>
        {group.joinQuestions.map((q, i) => (
          <div key={i}>
            <label htmlFor={`join-q-${i}`} className="block text-sm font-semibold text-slate-700 mb-1.5">
              {q}
            </label>
            <textarea id={`join-q-${i}`} rows={2} maxLength={300} value={answers[i]} onChange={(e) => setAnswers(answers.map((a, j) => (j === i ? e.target.value : a)))} className="input resize-none" />
          </div>
        ))}
        <button type="submit" disabled={!complete} className="btn-primary w-full">
          Gửi yêu cầu
        </button>
      </form>
    </div>
  );
};
