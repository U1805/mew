import React from 'react';

interface VideoPlayerProps {
  src: string;
  contentType: string;
  filename: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ src, contentType, filename }) => {
  return (
    <div className="relative rounded-lg overflow-hidden max-w-[400px] max-h-[300px] bg-black">
      <video
        controls
        className="w-full h-full object-contain"
        title={filename}
        onClick={(e) => e.stopPropagation()} // Prevent message click-through
      >
        <source src={src} type={contentType} />
        Your browser does not support the video tag.
      </video>
    </div>
  );
};
