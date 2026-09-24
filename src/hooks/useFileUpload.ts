import React, { useRef, useState } from 'react';
import { uploadFile, UploadResult } from '../utils/api';
import { useSocial } from '../context/SocialContext';

// Hook chọn tệp từ máy và upload lên server. Dùng ở mọi chỗ có nút "chọn ảnh / tệp".
// Cách dùng:
//   const upload = useFileUpload((files) => setImage(files[0].url));
//   <input ref={upload.inputRef} type="file" className="hidden" onChange={upload.onChange} />
//   <button onClick={upload.open} disabled={upload.isUploading}>Chọn ảnh</button>

export function useFileUpload(onUploaded: (files: UploadResult[]) => void) {
  const { showToast } = useSocial();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const onChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    // Xoá giá trị ô chọn tệp để lần sau chọn lại đúng tệp đó vẫn chạy onChange
    e.target.value = '';
    if (files.length === 0) return;
    setIsUploading(true);
    try {
      onUploaded(await Promise.all(files.map(uploadFile)));
    } catch {
      showToast('Tải tệp lên thất bại, vui lòng thử lại.', 'error');
    }
    setIsUploading(false);
  };

  return { inputRef, isUploading, onChange, open: () => inputRef.current?.click() };
}
