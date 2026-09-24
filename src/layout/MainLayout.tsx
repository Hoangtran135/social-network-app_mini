import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { PostFormModal } from '../components/post/PostFormModal';
import { ChatWindowsLayer } from '../components/chat/ChatWindowsLayer';
import { Toast } from '../components/Toast';

// Bố cục chung của mọi trang sau khi đăng nhập: thanh điều hướng trên cùng, sidebar trái,
// nội dung trang ở giữa (<Outlet />), sidebar phải (chỉ ở bảng tin), cửa sổ chat nổi và toast.
// Trang con muốn mở hộp thoại đăng bài thì gọi: const openCreatePost = useOutletContext<() => void>();

export const MainLayout: React.FC = () => {
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const isHome = useLocation().pathname === '/';
  const openCreatePost = () => setIsCreatePostOpen(true);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Navbar onOpenCreatePost={openCreatePost} />

      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-6">
        <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] xl:grid-cols-[16rem_1fr_18rem] gap-6 items-start">
          <LeftSidebar />
          <div className="min-w-0">
            <Outlet context={openCreatePost} />
          </div>
          <div className="hidden xl:block">{isHome && <RightSidebar />}</div>
        </div>
      </main>

      {isCreatePostOpen && <PostFormModal onClose={() => setIsCreatePostOpen(false)} />}
      <ChatWindowsLayer />
      <Toast />
    </div>
  );
};
