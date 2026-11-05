import { useRef, useState } from 'react';

// Bảng chọn cảm xúc cho một nút "Thích":
// - chuột: rê vào nút 300ms thì mở, rời ra thì đóng
// - cảm ứng: nhấn giữ 400ms thì mở (và cú chạm nhả tay ngay sau đó KHÔNG được tính là bấm "Thích")
// Cách dùng: const picker = useReactionPicker(); <div {...picker.containerProps}><button {...picker.buttonProps} onClick={() => picker.consumeLongPress() || thich()} /></div>

export function useReactionPicker() {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const longPressed = useRef(false);

  const cancel = () => clearTimeout(timer.current);

  return {
    open,
    close: () => setOpen(false),
    containerProps: {
      onMouseEnter: () => {
        timer.current = setTimeout(() => setOpen(true), 300);
      },
      onMouseLeave: () => {
        cancel();
        setOpen(false);
      },
    },
    buttonProps: {
      onTouchStart: () => {
        longPressed.current = false;
        timer.current = setTimeout(() => {
          longPressed.current = true;
          setOpen(true);
        }, 400);
      },
      onTouchEnd: cancel,
      onTouchMove: cancel,
      onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
    },
    /** Gọi đầu onClick: trả true (và reset) nếu cú bấm này chỉ là nhả tay sau khi nhấn giữ → bỏ qua. */
    consumeLongPress: () => {
      const was = longPressed.current;
      longPressed.current = false;
      return was;
    },
  };
}
