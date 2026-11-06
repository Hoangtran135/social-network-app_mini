import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../utils/api';
import { Page, PageCategory } from '../../types';
import { useSocial } from '../../context/SocialContext';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { FormField } from '../ui';
import { PAGE_CATEGORIES } from './pageUi';

// Hộp thoại tạo Trang (fanpage): tên, danh mục, mô tả, website, địa chỉ. Tạo xong chuyển tới trang vừa tạo.

export const CreatePageModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { showToast } = useSocial();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [category, setCategory] = useState<PageCategory>('business');
  const [description, setDescription] = useState('');
  const [website, setWebsite] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);
  useEscapeKey(onClose);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || name.trim().length < 2) return;
    setSaving(true);
    try {
      const { page } = await api.post<{ page: Page }>('/pages', {
        name: name.trim(),
        category,
        description: description.trim(),
        ...(website.trim() ? { website: website.trim() } : {}),
        ...(address.trim() ? { address: address.trim() } : {}),
      });
      showToast('Đã tạo trang!');
      onClose();
      navigate(`/pages/${page.id}`);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : 'Không thể tạo trang.', 'error');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-end sm:items-center justify-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-label="Tạo trang"
        className="animate-pop bg-white rounded-t-2xl sm:rounded-2xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[92dvh] overflow-y-auto overscroll-contain"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h3 className="section-title">Tạo trang mới</h3>
          <button type="button" aria-label="Đóng" onClick={onClose} className="p-1.5 rounded-full hover:bg-slate-100 text-slate-400">
            <X className="w-5 h-5" />
          </button>
        </div>
        <FormField label="Tên trang" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="VD: Tiệm bánh Hạnh Phúc" autoFocus />
        <div>
          <label htmlFor="page-category" className="field-label block mb-1.5">
            Danh mục
          </label>
          <select id="page-category" value={category} onChange={(e) => setCategory(e.target.value as PageCategory)} className="input">
            {PAGE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="page-desc" className="field-label block mb-1.5">
            Giới thiệu
          </label>
          <textarea id="page-desc" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Trang này nói về điều gì?" className="input resize-none" />
        </div>
        <FormField label="Website" type="url" inputMode="url" value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
        <FormField label="Địa chỉ" maxLength={200} value={address} onChange={(e) => setAddress(e.target.value)} />
        <button type="submit" disabled={saving || name.trim().length < 2} className="btn-primary w-full">
          {saving ? 'Đang tạo...' : 'Tạo trang'}
        </button>
      </form>
    </div>
  );
};
