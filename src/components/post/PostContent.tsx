import React from 'react';
import { Link } from 'react-router-dom';
import { splitHashtags } from '../../utils/hashtag';

// Nội dung bài viết: giữ nguyên xuống dòng và biến mỗi #hashtag thành liên kết tới trang /hashtag/<tag>.

export const PostContent: React.FC<{ text: string; className?: string }> = ({ text, className = '' }) => (
  <p className={`whitespace-pre-line break-words ${className}`}>
    {splitHashtags(text).map((part, i) =>
      part.type === 'tag' ? (
        <Link key={i} to={`/hashtag/${encodeURIComponent(part.tag)}`} className="text-blue-600 font-semibold hover:underline">
          {part.label}
        </Link>
      ) : (
        <React.Fragment key={i}>{part.text}</React.Fragment>
      )
    )}
  </p>
);
