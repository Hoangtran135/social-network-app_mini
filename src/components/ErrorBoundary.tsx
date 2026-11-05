import React from 'react';
import { AlertTriangle } from 'lucide-react';

// Chặn lỗi không lường trước khi vẽ giao diện (một component ném lỗi) để người dùng không bị trắng màn hình:
// hiện thông báo thân thiện cùng nút "Tải lại trang" / "Về trang chủ". Đổi resetKey (vd đường dẫn) thì tự thoát khỏi trạng thái lỗi.

interface Props {
  children: React.ReactNode;
  resetKey?: string;
}

export class ErrorBoundary extends React.Component<Props, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    console.error('Lỗi giao diện:', error);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="card--empty max-w-lg mx-auto my-10">
        <div className="empty-icon !bg-rose-50 !text-rose-500">
          <AlertTriangle className="w-8 h-8" />
        </div>
        <h3 className="section-title">Rất tiếc, đã có lỗi xảy ra</h3>
        <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">Trang này gặp sự cố không mong muốn. Bạn thử tải lại trang, hoặc quay về trang chủ nhé.</p>
        <div className="flex gap-2 justify-center mt-5">
          <button onClick={() => window.location.reload()} className="btn-primary">
            Tải lại trang
          </button>
          <a href="/" className="btn-secondary">
            Về trang chủ
          </a>
        </div>
      </div>
    );
  }
}
