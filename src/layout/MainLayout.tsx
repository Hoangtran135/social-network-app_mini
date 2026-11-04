import React, { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Navbar } from './Navbar';
import { LeftSidebar } from './LeftSidebar';
import { RightSidebar } from './RightSidebar';
import { MobileNav } from './MobileNav';
import { PostFormModal } from '../components/post/PostFormModal';
import { ChatWindowsLayer } from '../components/chat/ChatWindowsLayer';
import { Toast } from '../components/Toast';

// Bố cục chung của mọi trang sau khi đăng nhập: thanh điều hướng trên cùng, sidebar trái,
// nội dung trang ở giữa (<Outlet />), sidebar phải (chỉ ở bảng tin), thanh điều hướng dưới (chỉ điện thoại),
// cửa sổ chat nổi và toast.
// Trang con muốn mở hộp thoại đăng bài thì gọi: const openCreatePost = useOutletContext<() => void>();

export const MainLayout: React.FC = () => {
  const [isCreatePostOpen, setIsCreatePostOpen] = useState(false);
  const isHome = useLocation().pathname === '/';
  const openCreatePost = () => setIsCreatePostOpen(true);

  // Chỉ bảng tin mới có cột phải; các trang khác dùng 2 cột để nội dung không bị lệch sang một bên
  const columns = isHome ? 'lg:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)_18rem]' : 'lg:grid-cols-[15rem_minmax(0,1fr)]';

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      <Navbar onOpenCreatePost={openCreatePost} />

      {/* pb-24 trên điện thoại chừa chỗ cho thanh điều hướng dưới */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-3 sm:px-4 lg:px-6 py-4 sm:py-6 pb-24 lg:pb-6">
        <div className={`grid grid-cols-1 ${columns} gap-6 items-start`}>
          <LeftSidebar />
          {/* [&>*]:mx-auto — mỗi trang tự giới hạn bề rộng (max-w-*), ở đây căn giữa chúng trong cột nội dung */}
          <div className="min-w-0 [&>*]:mx-auto">
            <Outlet context={openCreatePost} />
          </div>
          {isHome && (
            <div className="hidden xl:block">
              <RightSidebar />
            </div>
          )}
        </div>
      </main>

      <MobileNav onOpenCreatePost={openCreatePost} />
      {isCreatePostOpen && <PostFormModal onClose={() => setIsCreatePostOpen(false)} />}
      <ChatWindowsLayer />
      <Toast />
    </div>
  );
};
