import React, { useState } from 'react';
import { Camera, Loader2, Settings } from 'lucide-react';
import { api } from '../../../utils/api';
import { Page, PageCategory } from '../../../types';
import { useManageAction } from '../../../hooks/useManageAction';
import { useFileUpload } from '../../../hooks/useFileUpload';
import { AdminSection, FormField, SquareAvatar } from '../../ui';
import { PAGE_CATEGORIES } from '../pageUi';

// Mục "Thông tin trang" của tab Quản trị: tên, danh mục, giới thiệu, website, địa chỉ, ảnh đại diện và ảnh bìa.

export const PageSettings: React.FC<{ page: Page; reload: () => void }> = ({ page, reload }) => {
  const [form, setForm] = useState({
    name: page.name,
    category: page.category,
    description: page.description,
    website: page.website || '',
    address: page.address || '',
    avatar: page.avatar || '',
    cover: page.cover || '',
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
        api.patch(`/pages/${page.id}`, {
          name: form.name.trim(),
          category: form.category,
          description: form.description.trim(),
          website: form.website.trim(),
          address: form.address.trim(),
          avatar: form.avatar || undefined,
          cover: form.cover || undefined,
        }),
      'Đã lưu thông tin trang.'
    );
  };

  return (
    <AdminSection icon={Settings} title="Thông tin trang">
      <form onSubmit={save} className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <SquareAvatar item={{ name: form.name || page.name, avatar: form.avatar }} size="size-14" />
          <input ref={avatarUpload.inputRef} type="file" accept="image/*" className="hidden" onChange={avatarUpload.onChange} />
          <input ref={coverUpload.inputRef} type="file" accept="image/*" className="hidden" onChange={coverUpload.onChange} />
          <button type="button" onClick={avatarUpload.open} disabled={avatarUpload.isUploading} className="btn-secondary btn-sm">
            {avatarUpload.isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Đổi ảnh trang
          </button>
          <button type="button" onClick={coverUpload.open} disabled={coverUpload.isUploading} className="btn-secondary btn-sm">
            {coverUpload.isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />} Đổi ảnh bìa
          </button>
        </div>
        <FormField label="Tên trang" required maxLength={80} value={form.name} onChange={(e) => set('name', e.target.value)} />
        <div>
          <label htmlFor="ps-category" className="field-label block mb-1.5">
            Danh mục
          </label>
          <select id="ps-category" value={form.category} onChange={(e) => set('category', e.target.value as PageCategory)} className="input">
            {PAGE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="ps-desc" className="field-label block mb-1.5">
            Giới thiệu
          </label>
          <textarea id="ps-desc" rows={3} maxLength={1000} value={form.description} onChange={(e) => set('description', e.target.value)} className="input resize-none" />
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label="Website" type="url" inputMode="url" value={form.website} onChange={(e) => set('website', e.target.value)} placeholder="https://..." />
          <FormField label="Địa chỉ" maxLength={200} value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <button type="submit" disabled={busy || form.name.trim().length < 2} className="btn-primary">
          Lưu thay đổi
        </button>
      </form>
    </AdminSection>
  );
};
