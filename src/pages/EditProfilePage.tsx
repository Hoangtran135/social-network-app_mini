import React, { useState } from 'react';
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile(form);
      showToast('Đã lưu thông tin trang cá nhân!');
      navigate(`/profile/${currentUser?.id}`);
    } catch {
      showToast('Không thể lưu thông tin, vui lòng thử lại.', 'error');
    }
  };

  const textField = (key: keyof typeof form, label: string, placeholder = '') => (
    <FormField label={label} placeholder={placeholder} value={form[key]} onChange={(e) => setField(key, e.target.value)} />
  );

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <Link to={`/profile/${currentUser?.id}`} className="inline-flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-blue-600">
          <ArrowLeft className="w-4 h-4" /> Quay lại trang cá nhân
        </Link>
        <h1 className="text-xl font-black text-slate-800">Chỉnh sửa hồ sơ</h1>
      </div>

      <div className="card rounded-3xl p-6 space-y-4">
        <h3 className="font-bold text-sm text-slate-800">Ảnh bìa & ảnh đại diện</h3>
        {form.coverImage && <img src={form.coverImage} alt="" className="h-32 w-full object-cover rounded-xl" />}
        <PickImageButton upload={coverUpload} label="Chọn ảnh bìa" />
        <div className="flex items-center gap-4">
          <img src={form.avatar} alt="" className="w-16 h-16 rounded-full object-cover" />
          <PickImageButton upload={avatarUpload} label="Chọn ảnh đại diện" />
        </div>
      </div>

      <div className="card rounded-3xl p-6 space-y-4">
        <h3 className="font-bold text-sm text-slate-800">Thông tin cá nhân</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label="Họ và tên" required value={form.name} onChange={(e) => setField('name', e.target.value)} />
          <FormField label="Tên người dùng (không đổi được)" disabled value={`@${currentUser?.username}`} className="text-slate-400" />
          {textField('workplace', 'Nơi làm việc', 'VD: Kỹ sư tại FPT')}
          {textField('education', 'Học vấn', 'VD: Đại học Bách Khoa')}
          {textField('location', 'Nơi sống', 'VD: Hà Nội')}
          {textField('website', 'Website', 'https://...')}
        </div>
        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">Tiểu sử</label>
        <textarea rows={3} value={form.bio} onChange={(e) => setField('bio', e.target.value)} className="input" />
      </div>

      <div className="flex gap-3 justify-end">
        <Link to={`/profile/${currentUser?.id}`} className="btn-secondary px-6 py-3">
          Hủy bỏ
        </Link>
        <button type="submit" className="btn-primary px-8 py-3 flex items-center gap-2">
          <Save className="w-4 h-4" /> Lưu thay đổi
        </button>
      </div>
    </form>
  );
};

/** Nút chọn ảnh kèm ô chọn tệp ẩn; hiện vòng xoay khi đang upload. */
const PickImageButton: React.FC<{ upload: ReturnType<typeof useFileUpload>; label: string }> = ({ upload, label }) => (
  <>
    <input ref={upload.inputRef} type="file" accept="image/*" className="hidden" onChange={upload.onChange} />
    <button type="button" onClick={upload.open} disabled={upload.isUploading} className="btn-secondary flex-1 w-full flex items-center justify-center gap-2">
      {upload.isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
      {upload.isUploading ? 'Đang tải ảnh lên...' : label}
    </button>
  </>
);
