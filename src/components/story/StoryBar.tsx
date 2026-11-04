import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { useSocial } from '../../context/SocialContext';
import { useAuth } from '../../context/AuthContext';
import { CreateStoryModal } from './CreateStoryModal';
import { StoryViewer } from './StoryViewer';

// Thanh story ngang ở đầu bảng tin: thẻ "Tạo tin" + mỗi story một thẻ.
// Bấm vào một story để mở trình xem; viền xanh = chưa xem, viền xám = đã xem.

export const StoryBar: React.FC = () => {
  const { stories } = useSocial();
  const { currentUser } = useAuth();
  const [isCreating, setIsCreating] = useState(false);
  const [viewingIndex, setViewingIndex] = useState<number | null>(null);

  return (
    <div className="mb-5 flex gap-2.5 overflow-x-auto no-scrollbar pb-1 -mx-3 px-3 sm:mx-0 sm:px-0">
      <button onClick={() => setIsCreating(true)} className="card w-28 h-44 shrink-0 overflow-hidden flex flex-col relative hover:shadow-md transition-shadow">
        <img src={currentUser?.avatar} alt="" className="w-full h-3/4 object-cover" />
        <span className="absolute left-1/2 top-[75%] -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-blue-600 text-white border-4 border-white flex items-center justify-center">
          <Plus className="w-4 h-4" />
        </span>
        <span className="flex-1 flex items-end justify-center pb-2 text-[11px] font-bold text-slate-800">Tạo tin</span>
      </button>

      {stories.map((story, index) => {
        const viewed = story.viewers.some((v) => v.userId === currentUser?.id);
        return (
          <button key={story.id} type="button" aria-label={`Xem tin của ${story.user.name}`} onClick={() => setViewingIndex(index)} className="relative w-28 h-44 rounded-2xl overflow-hidden shrink-0 text-left hover:brightness-95 transition">
            {story.type === 'text' ? (
              <div className={`w-full h-full bg-gradient-to-br ${story.backgroundGradient} flex items-center justify-center p-3 text-center text-white text-[11px] font-bold`}>
                {story.textContent}
              </div>
            ) : (
              <img src={story.mediaUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
            <img src={story.user.avatar} alt="" className={`absolute top-2.5 left-2.5 w-9 h-9 rounded-full object-cover border-2 ${viewed ? 'border-slate-400' : 'border-blue-500'}`} />
            <span className="absolute bottom-2.5 inset-x-2 text-xs font-bold text-white truncate">{story.user.name}</span>
          </button>
        );
      })}

      {isCreating && <CreateStoryModal onClose={() => setIsCreating(false)} />}
      {viewingIndex !== null && <StoryViewer startIndex={viewingIndex} onClose={() => setViewingIndex(null)} />}
    </div>
  );
};
