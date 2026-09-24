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
    <div className="mb-5 flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
      <button onClick={() => setIsCreating(true)} className="card w-28 h-44 shrink-0 overflow-hidden flex flex-col">
        <img src={currentUser?.avatar} alt="" className="w-full h-3/4 object-cover" />
        <span className="flex-1 flex items-center justify-center gap-1 text-[11px] font-bold text-slate-800">
          <Plus className="w-4 h-4 text-blue-600" /> Tạo tin
        </span>
      </button>

      {stories.map((story, index) => {
        const viewed = story.viewers.some((v) => v.userId === currentUser?.id);
        return (
          <div key={story.id} onClick={() => setViewingIndex(index)} className="relative w-28 h-44 rounded-2xl overflow-hidden shrink-0 cursor-pointer">
            {story.type === 'text' ? (
              <div className={`w-full h-full bg-gradient-to-br ${story.backgroundGradient} flex items-center justify-center p-3 text-center text-white text-[11px] font-bold`}>
                {story.textContent}
              </div>
            ) : (
              <img src={story.mediaUrl} alt="" className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-black/60" />
            <img src={story.user.avatar} alt="" className={`absolute top-2.5 left-2.5 w-9 h-9 rounded-full object-cover border-2 ${viewed ? 'border-slate-400' : 'border-blue-500'}`} />
            <span className="absolute bottom-2.5 inset-x-2 text-xs font-bold text-white truncate">{story.user.name}</span>
          </div>
        );
      })}

      {isCreating && <CreateStoryModal onClose={() => setIsCreating(false)} />}
      {viewingIndex !== null && <StoryViewer startIndex={viewingIndex} onClose={() => setViewingIndex(null)} />}
    </div>
  );
};
