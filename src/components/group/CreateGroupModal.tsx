import React, { useState } from 'react';
import { X, Globe, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../utils/api';
import { Group } from '../../types';
import { useSocial } from '../../context/SocialContext';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { FormField } from '../ui';

// Hộp thoại tạo nhóm mới: tên, mô tả, quyền riêng tư (công khai / riêng tư), nội quy (mỗi dòng một điều),
// câu hỏi khi xin vào (chỉ nhóm riêng tư, tối đa 3) và bật / tắt duyệt bài. Tạo xong chuyển tới trang nhóm.

export const CreateGroupModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { showToast } = useSocial();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [privacy, setPrivacy] = useState<'public' | 'private'>('public');
  const [rules, setRules] = useState('');
  const [questions, setQuestions] = useState(['', '', '']);
  const [postApproval, setPostApproval] = useState(false);
  const [saving, setSaving] = useState(false);
  useEscapeKey(onClose);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || name.trim().length < 2) return;
    setSaving(true);
    try {
      const { group } = await api.post<{ group: Group }>('/groups', {
        name: name.trim(),
        description: description.trim(),
        privacy,
        rules: rules
          .split('\n')
          .map((r) => r.trim())
          .filter(Boolean)
          .slice(0, 10),
        joinQuestions: privacy === 'private' ? questions.map((q) => q.trim()).filter(Boolean) : [],
        postApproval,
      });
      showToast('Đã tạo nhóm!');
      onClose();
      navigate(`/groups/${group.id}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Không thể tạo nhóm.', 'error');
      setSaving(false);
    }
  };

  const option = (value: 'public' | 'private', Icon: typeof Globe, title: string, text: string) => (
    <label className={`flex-1 flex gap-3 p-3 rounded-xl border cursor-pointer ${privacy === value ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:bg-slate-50'}`}>
      <input type="radio" name="group-privacy" checked={privacy === value} onChange={() => setPrivacy(value)} className="sr-only" />
      <Icon className="w-5 h-5 mt-0.5 text-slate-600 shrink-0" />
      <span>
        <span className="block text-sm font-semibold text-slate-800">{title}</span>
        <span className="block text-xs text-slate-500">{text}</span>
      </span>
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="Tạo nhóm"
        className="animate-pop bg-white rounded-t-2xl sm:rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto overscroll-contain"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="section-title">Tạo nhóm mới</h3>
          <button type="button" aria-label="Đóng" onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>

        <FormField label="Tên nhóm" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Hội yêu du lịch" autoFocus />

        <div>
          <label htmlFor="group-desc" className="field-label block mb-1.5">
            Mô tả
          </label>
          <textarea id="group-desc" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Nhóm này dành cho ai, nói về chủ đề gì?" className="input resize-none" />
        </div>

        <div role="radiogroup" aria-label="Quyền riêng tư của nhóm" className="flex flex-col sm:flex-row gap-2">
          {option('public', Globe, 'Công khai', 'Ai cũng xem được bài viết và vào nhóm ngay.')}
          {option('private', Lock, 'Riêng tư', 'Chỉ thành viên xem được bài. Người mới phải được duyệt.')}
        </div>

        <div>
          <label htmlFor="group-rules" className="field-label block mb-1.5">
            Nội quy (mỗi dòng một điều)
          </label>
          <textarea id="group-rules" rows={3} value={rules} onChange={(e) => setRules(e.target.value)} placeholder={'Tôn trọng mọi người\nKhông quảng cáo'} className="input resize-none" />
        </div>

        {privacy === 'private' && (
          <fieldset className="space-y-2">
            <legend className="field-label mb-1.5">Câu hỏi khi xin vào nhóm (tối đa 3)</legend>
            {questions.map((q, i) => (
              <input
                key={i}
                value={q}
                maxLength={150}
                aria-label={`Câu hỏi ${i + 1}`}
                onChange={(e) => setQuestions(questions.map((x, j) => (j === i ? e.target.value : x)))}
                placeholder={`Câu hỏi ${i + 1} (không bắt buộc)`}
                className="input"
              />
            ))}
          </fieldset>
        )}

        <label className="flex items-start gap-3 text-sm text-slate-700">
          <input type="checkbox" checked={postApproval} onChange={(e) => setPostApproval(e.target.checked)} className="mt-1" />
          <span>
            <span className="font-semibold">Duyệt bài trước khi đăng</span>
            <span className="block text-xs text-slate-500">Bài của thành viên thường chỉ hiện sau khi quản trị viên duyệt.</span>
          </span>
        </label>

        <button type="submit" disabled={saving || name.trim().length < 2} className="btn-primary w-full">
          {saving ? 'Đang tạo...' : 'Tạo nhóm'}
        </button>
      </form>
    </div>
  );
};
