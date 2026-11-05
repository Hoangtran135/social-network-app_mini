import React, { useId, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Save, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocial } from '../context/SocialContext';
import { useFileUpload } from '../hooks/useFileUpload';
import { FormField, AvatarFrame } from '../components/ui';
import { AVATAR_FRAMES } from '../utils/avatarFrames';
import { SOCIAL_PLATFORMS, isValidSocialUrl } from '../utils/socialLinks';
import { AvatarFrame as FrameKey, SocialPlatform } from '../types';

// Trang sửa hồ sơ (/settings/profile): ảnh bìa, ảnh đại diện, họ tên, tiểu sử, nơi làm việc, học vấn, nơi sống, website.
// Chọn ảnh là upload ngay, nhưng chỉ khi bấm "Lưu thay đổi" hồ sơ mới được cập nhật.

export const EditProfilePage: React.FC = () => {
  const { currentUser, updateProfile } = useAuth();
  const { showToast } = useSocial();
  const navigate = useNavigate();
  const bioId = useId();
  const [saving, setSaving] = useState(false);
  const [frame, setFrame] = useState<FrameKey>(currentUser?.avatarFrame || 'none');
  const [links, setLinks] = useState<Record<SocialPlatform, string>>(() => Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.key, currentUser?.socialLinks?.[p.key] || ''])) as Record<SocialPlatform, string>);
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
    const bad = SOCIAL_PLATFORMS.find((p) => !isValidSocialUrl(links[p.key]));
    if (bad) return showToast(`Liên kết ${bad.label} phải bắt đầu bằng http:// hoặc https://`, 'error');
    setSaving(true);
    try {
      await updateProfile({ ...form, avatarFrame: frame, socialLinks: Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.key, links[p.key].trim()])) });
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
    <form onSubmit={handleSubmit} className="page-medium space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="page-title">Chỉnh sửa hồ sơ</h1>
        <Link to={`/profile/${currentUser?.id}`} className="btn-secondary btn-sm">
          <ArrowLeft className="w-4 h-4" /> Quay lại trang cá nhân
        </Link>
      </div>

      <div className="card rounded-2xl overflow-hidden">
        <h3 className="section-title px-5 sm:px-6 pt-5 pb-3">Ảnh bìa & ảnh đại diện</h3>
        {/* Xem trước đúng như trang cá nhân: ảnh bìa, ảnh đại diện đè lên mép dưới */}
        <div className="relative">
          <div className="h-32 sm:h-44 bg-gradient-to-r from-blue-600 to-purple-600">
            {form.coverImage && <img src={form.coverImage} alt="Ảnh bìa" className="w-full h-full object-cover" />}
          </div>
          <PickImageButton upload={coverUpload} label="Đổi ảnh bìa" className="absolute top-3 right-3 !bg-white/90 hover:!bg-white !text-slate-700 shadow" />
        </div>
        <div className="px-5 sm:px-6 pb-5 -mt-10 flex items-end gap-4 relative z-10">
          <AvatarFrame frame={frame} className="shadow-lg">
            <img src={form.avatar} alt="Ảnh đại diện" className="w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-4 border-white bg-slate-200 shrink-0" />
          </AvatarFrame>
          <PickImageButton upload={avatarUpload} label="Đổi ảnh đại diện" className="mb-1" />
        </div>
      </div>

      <div className="card rounded-2xl p-5 sm:p-6 space-y-3">
        <h3 className="section-title">Khung ảnh đại diện</h3>
        <div className="flex flex-wrap gap-3" role="group" aria-label="Chọn khung ảnh đại diện">
          {AVATAR_FRAMES.map((f) => (
            <button key={f.key} type="button" aria-pressed={frame === f.key} aria-label={f.label} title={f.label} onClick={() => setFrame(f.key)} className={`flex flex-col items-center gap-1 text-[11px] font-semibold ${frame === f.key ? 'text-blue-600' : 'text-slate-500'}`}>
              <span className={`w-12 h-12 rounded-full p-[3px] ${f.className || 'bg-slate-200'} ${frame === f.key ? 'ring-2 ring-blue-600 ring-offset-2' : ''}`}>
                <img src={form.avatar} alt="" className="w-full h-full rounded-full object-cover border-2 border-white bg-slate-200" />
              </span>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card rounded-2xl p-5 sm:p-6 space-y-4">
        <h3 className="section-title">Liên kết mạng xã hội</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          {SOCIAL_PLATFORMS.map((p) => (
            <FormField key={p.key} label={p.label} icon={p.icon} type="url" inputMode="url" placeholder={p.placeholder} value={links[p.key]} onChange={(e) => setLinks((l) => ({ ...l, [p.key]: e.target.value }))} />
          ))}
        </div>
        <p className="text-xs text-slate-500">Để trống nếu không muốn hiển thị. Liên kết phải bắt đầu bằng http:// hoặc https://.</p>
      </div>

      <div className="card rounded-2xl p-5 sm:p-6 space-y-4">
        <h3 className="section-title">Thông tin cá nhân</h3>
        <div className="grid sm:grid-cols-2 gap-4">
          <FormField label="Họ và tên" required value={form.name} onChange={(e) => setField('name', e.target.value)} />
          <FormField label="Tên người dùng (không đổi được)" disabled value={`@${currentUser?.username}`} className="text-slate-400" />
          {textField('workplace', 'Nơi làm việc', 'VD: Kỹ sư tại FPT')}
          {textField('education', 'Học vấn', 'VD: Đại học Bách Khoa')}
          {textField('location', 'Nơi sống', 'VD: Hà Nội')}
          {textField('website', 'Website', 'https://...')}
        </div>
        <div>
          <label htmlFor={bioId} className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
            Tiểu sử
          </label>
          <textarea id={bioId} rows={3} value={form.bio} onChange={(e) => setField('bio', e.target.value)} placeholder="Giới thiệu đôi nét về bạn..." className="input resize-none" />
        </div>
      </div>

      {/* Nút lưu dính ở đáy màn hình khi cuộn; trên điện thoại xếp dọc, nút chính ở trên */}
      <div className="flex flex-col-reverse sm:flex-row gap-3 sm:justify-end">
        <Link to={`/profile/${currentUser?.id}`} className="btn-secondary px-6">
          Hủy bỏ
        </Link>
        <button type="submit" disabled={saving || isUploading} className="btn-primary px-8">
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
