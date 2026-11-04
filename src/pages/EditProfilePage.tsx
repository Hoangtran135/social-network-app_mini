import React, { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Save, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useFileUpload } from '../hooks/useFileUpload';
import { FormField } from '../components/ui';

// Trang sửa hồ sơ (/settings/profile): ảnh bìa, ảnh đại diện, họ tên, tiểu sử, nơi làm việc, học vấn, nơi sống, website.
// Chọn ảnh là upload ngay, nhưng chỉ khi bấm "Lưu thay đổi" hồ sơ mới được cập nhật.

export const EditProfilePage: React.FC = () => {
  const { currentUser, updateProfile } = useAuth();
  const { showToast } = useSocial();
  const navigate = useNavigate();
  const bioId = useId();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: currentUser?.name || '',
    bio: currentUser?.bio || '',
    workplace: currentUser?.workplace || '',
    education: currentUser?.education || '',
    location: currentUser?.location || '',
    website: currentUser?.website || '',
    avatar: currentUser?.avatar || '',
    coverImage: currentUser?.coverImage || '',
  });
  const setField = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));
  const avatarUpload = useFileUpload((files) => setField('avatar', files[0].url));
  const coverUpload = useFileUpload((files) => setField('coverImage', files[0].url));
  const isUploading = avatarUpload.isUploading || coverUpload.isUploading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || isUploading) return;
    setSaving(true);
    try {
      await updateProfile(form);
      showToast('Đã lưu thông tin trang cá nhân!');
      navigate(`/profile/${currentUser?.id}`);
    } catch {
      showToast('Không thể lưu thông tin, vui lòng thử lại.', 'error');
      setSaving(false);
    }
  };

  const textField = (key: keyof typeof form, label: string, placeholder = '') => (
    <FormField label={label} placeholder={placeholder} value={form[key]} onChange={(e) => setField(key, e.target.value)} />
  );

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link to={`/profile/${currentUser?.id}`} className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-blue-600">
          <ArrowLeft className="w-4 h-4" /> Quay lại trang cá nhân
        </Link>
        <h1 className="text-xl font-black text-slate-800">Chỉnh sửa hồ sơ</h1>
      </div>

      <div className="card rounded-3xl overflow-hidden">
        <h3 className="font-bold text-sm text-slate-800 px-5 sm:px-6 pt-5 pb-3">Ảnh bìa & ảnh đại diện</h3>
        {/* Xem trước đúng như trang cá nhân: ảnh bìa, ảnh đại diện đè lên mép dưới */}
        <div className="relative">
          <div className="h-32 sm:h-44 bg-gradient-to-r from-blue-600 to-purple-600">
            {form.coverImage && <img src={form.coverImage} alt="Ảnh bìa" className="w-full h-full object-cover" />}
          </div>
          <PickImageButton upload={coverUpload} label="Đổi ảnh bìa" className="absolute top-3 right-3 !bg-white/90 hover:!bg-white !text-slate-700 shadow" />
        </div>
        <div className="px-5 sm:px-6 pb-5 -mt-10 flex items-end gap-4">
          <img src={form.avatar} alt="Ảnh đại diện" className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-white shadow-lg bg-slate-200 shrink-0" />
          <PickImageButton upload={avatarUpload} label="Đổi ảnh đại diện" className="mb-1" />
        </div>
      </div>

      <div className="card rounded-3xl p-5 sm:p-6 space-y-4">
        <h3 className="font-bold text-sm text-slate-800">Thông tin cá nhân</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label="Họ và tên" required value={form.name} onChange={(e) => setField('name', e.target.value)} />
          <FormField label="Tên người dùng (không đổi được)" disabled value={`@${currentUser?.username}`} className="text-slate-400" />
          {textField('workplace', 'Nơi làm việc', 'VD: Kỹ sư tại FPT')}
          {textField('education', 'Học vấn', 'VD: Đại học Bách Khoa')}
          {textField('location', 'Nơi sống', 'VD: Hà Nội')}
          {textField('website', 'Website', 'https://...')}
        </div>
        <div>
          <label htmlFor={bioId} className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
            Tiểu sử
          </label>
          <textarea id={bioId} rows={3} value={form.bio} onChange={(e) => setField('bio', e.target.value)} placeholder="Giới thiệu đôi nét về bạn..." className="input resize-none" />
        </div>
      </div>

      {/* Nút lưu dính ở đáy màn hình khi cuộn; trên điện thoại xếp dọc, nút chính ở trên */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
        <Link to={`/profile/${currentUser?.id}`} className="btn-secondary px-6 py-3 text-center">
          Hủy bỏ
        </Link>
        <button type="submit" disabled={saving || isUploading} className="btn-primary px-8 py-3 flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Đang lưu...' : isUploading ? 'Đang tải ảnh...' : 'Lưu thay đổi'}
        </button>
      </div>
    </form>
  );
};

/** Nút chọn ảnh kèm ô chọn tệp ẩn; hiện vòng xoay khi đang upload. */
const PickImageButton: React.FC<{ upload: ReturnType<typeof useFileUpload>; label: string; className?: string }> = ({ upload, label, className = '' }) => (
  <>
    <input ref={upload.inputRef} type="file" accept="image/*" className="hidden" onChange={upload.onChange} />
    <button type="button" onClick={upload.open} disabled={upload.isUploading} className={`btn-secondary flex items-center justify-center gap-2 ${className}`}>
      {upload.isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
      {upload.isUploading ? 'Đang tải...' : label}
    </button>
  </>
);
