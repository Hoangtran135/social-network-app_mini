import React, { createContext, useContext, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

// Hộp thoại xác nhận "Đồng ý / Hủy" dùng chung, thay cho window.confirm() của trình duyệt.
// Cách dùng: const confirm = useConfirm(); if (await confirm('Xoá bài viết?')) { ...xoá... }

type ConfirmFn = (message: string) => Promise<boolean>;

const ConfirmDialogContext = createContext<ConfirmFn | null>(null);

export const ConfirmDialogProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [message, setMessage] = useState<string | null>(null);
  // Giữ hàm "resolve" của Promise đang chờ, để khi người dùng bấm nút thì trả kết quả true / false
  const resolveRef = useRef<(ok: boolean) => void>(() => {});

  const confirm: ConfirmFn = (text) => {
    setMessage(text);
    return new Promise((resolve) => (resolveRef.current = resolve));
  };

  const close = (ok: boolean) => {
    resolveRef.current(ok);
    setMessage(null);
  };

  return (
    <ConfirmDialogContext.Provider value={confirm}>
      {children}
      {message && (
        <div className="fixed inset-0 z-[60] bg-slate-900/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex items-center gap-2.5 text-rose-600">
              <AlertTriangle className="w-5 h-5" />
              <h3 className="font-bold text-slate-800">Xác nhận</h3>
            </div>
            <p className="mt-3 text-sm text-slate-600">{message}</p>
            <div className="flex gap-2 pt-5">
              <button onClick={() => close(false)} className="btn-secondary flex-1">
                Hủy
              </button>
              <button onClick={() => close(true)} autoFocus className="btn-primary flex-1 bg-rose-600 hover:bg-rose-700">
                Đồng ý
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmDialogContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useConfirm = () => useContext(ConfirmDialogContext)!;
