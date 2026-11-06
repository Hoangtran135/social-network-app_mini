import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Loader2, Settings, Trash2 } from 'lucide-react';
import { api } from '../../../utils/api';
import { Group } from '../../../types';
import { useConfirm } from '../../../context/ConfirmDialogContext';
import { useManageAction } from '../../../hooks/useManageAction';
import { useFileUpload } from '../../../hooks/useFileUpload';
import { AdminSection, FormField, SquareAvatar } from '../../ui';

// Mục "Cài đặt nhóm" của tab Quản trị nhóm: tên, mô tả, ảnh, quyền riêng tư (chỉ chủ nhóm), nội quy, câu hỏi, duyệt bài; xoá nhóm (chỉ chủ nhóm).

export const GroupSettings: React.FC<{ group: Group; reload: () => void }> = ({ group, reload }) => {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const isOwner = group.myRole === 'owner';
  const [form, setForm] = useState({
    name: group.name,
    description: group.description,
    privacy: group.privacy,
    rules: group.rules.join('\n'),
    questions: [0, 1, 2].map((i) => group.joinQuestions[i] || ''),
    postApproval: group.postApproval,
    avatar: group.avatar || '',
    cover: group.cover || '',
  });
  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const avatarUpload = useFileUpload((files) => set('avatar', files[0].url));
  const coverUpload = useFileUpload((files) => set('cover', files[0].url));
  const { act, busy } = useManageAction(reload);

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return;
    act(
      () =>
        api.patch(`/groups/${group.id}`, {
          name: form.name.trim(),
          description: form.description.trim(),
          ...(isOwner ? { privacy: form.privacy } : {}),
          rules: form.rules.split('\n').map((r) => r.trim()).filter(Boolean).slice(0, 10),
          joinQuestions: form.questions.map((q) => q.trim()).filter(Boolean),
          postApproval: form.postApproval,
          avatar: form.avatar || undefined,
          cover: form.cover || undefined,
        }),
      'Đã lưu cài đặt nhóm.'
    );
  };

  return (
    <AdminSection icon={Settings} title="Cài đặt nhóm">
      <form onSubmit={save} className="space-y-4">
        <div className="flex items-center gap-3">
          <SquareAvatar item={{ name: form.name || group.name, avatar: form.avatar }} size="size-14" />
          <input ref={avatarUpload.inputRef} type="file" accept="image/*" className="hidden" onChange={avatarUpload.onChange} />
          <input ref={coverUpload.inputRef} type="file" accept="image/*" className="hidden" onChange={coverUpload.onChange} />
          <button type="button" onClick={avatarUpload.open} disabled={avatarUpload.isUploading} className="btn-secondary btn-sm">
            {avatarUpload.isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Đổi ảnh nhóm
          </button>
          <button type="button" onClick={coverUpload.open} disabled={coverUpload.isUploading} className="btn-secondary btn-sm">
            {coverUpload.isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Đổi ảnh bìa
          </button>
        </div>
        <FormField label="Tên nhóm" required maxLength={80} value={form.name} onChange={(e) => set('name', e.target.value)} />
        <div>
          <label htmlFor="gs-desc" className="field-label block mb-1.5">
            Mô tả
          </label>
          <textarea id="gs-desc" rows={3} maxLength={1000} value={form.description} onChange={(e) => set('description', e.target.value)} className="input resize-none" />
        </div>
        <div>
          <label htmlFor="gs-privacy" className="field-label block mb-1.5">
            Quyền riêng tư
          </label>
          <select id="gs-privacy" value={form.privacy} disabled={!isOwner} onChange={(e) => set('privacy', e.target.value as Group['privacy'])} className="input">
            <option value="public">Công khai — ai cũng xem và vào được</option>
            <option value="private">Riêng tư — người mới phải được duyệt</option>
          </select>
          {!isOwner && <p className="text-xs text-slate-400 mt-1">Chỉ chủ nhóm mới đổi được quyền riêng tư.</p>}
        </div>
        <div>
          <label htmlFor="gs-rules" className="field-label block mb-1.5">
            Nội quy (mỗi dòng một điều)
          </label>
          <textarea id="gs-rules" rows={4} value={form.rules} onChange={(e) => set('rules', e.target.value)} className="input resize-none" />
        </div>
        <fieldset className="space-y-2">
          <legend className="field-label mb-1.5">Câu hỏi khi xin vào nhóm riêng tư</legend>
          {form.questions.map((q, i) => (
            <input key={i} value={q} maxLength={150} aria-label={`Câu hỏi ${i + 1}`} onChange={(e) => set('questions', form.questions.map((x, j) => (j === i ? e.target.value : x)))} placeholder={`Câu hỏi ${i + 1} (không bắt buộc)`} className="input" />
          ))}
        </fieldset>
        <label className="flex items-center gap-3 text-sm text-slate-700">
          <input type="checkbox" checked={form.postApproval} onChange={(e) => set('postApproval', e.target.checked)} />
          <span className="font-semibold">Duyệt bài trước khi đăng</span>
        </label>
        <div className="flex flex-wrap gap-2 justify-between">
          <button type="submit" disabled={busy || form.name.trim().length < 2} className="btn-primary">
            Lưu thay đổi
          </button>
          {isOwner && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!(await confirm(`Xoá nhóm "${group.name}"? Toàn bộ bài viết và thành viên sẽ bị xoá vĩnh viễn.`))) return;
                if (await act(() => api.delete(`/groups/${group.id}`), 'Đã xoá nhóm.')) navigate('/groups');
              }}
              className="btn-secondary !text-rose-600 hover:!bg-rose-50"
            >
              <Trash2 className="w-4 h-4" /> Xoá nhóm
            </button>
          )}
        </div>
      </form>
    </AdminSection>
  );
};
