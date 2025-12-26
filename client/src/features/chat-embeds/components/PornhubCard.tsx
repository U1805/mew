import React, { useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import type { MessagePayload } from '../../../shared/types';

function safeHostname(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

interface PornhubCardProps {
  payload: MessagePayload;
}

export const PornhubCard: React.FC<PornhubCardProps> = ({ payload }) => {
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const url = typeof payload.url === 'string' ? payload.url.trim() : '';
  const s3ThumbnailUrl = typeof payload.s3_thumbnail_url === 'string' ? payload.s3_thumbnail_url.trim() : '';
  const thumbnailUrl = s3ThumbnailUrl || (typeof payload.thumbnail_url === 'string' ? payload.thumbnail_url.trim() : '');
  const s3PreviewUrl = typeof payload.s3_preview_url === 'string' ? payload.s3_preview_url.trim() : '';
  const previewUrl = s3PreviewUrl || (typeof payload.preview_url === 'string' ? payload.preview_url.trim() : '');

  const hostname = useMemo(() => safeHostname(url), [url]);

  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewFailed, setPreviewFailed] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  
  // 只有当有预览链接且加载未失败时才尝试显示视频
  const canShowVideo = Boolean(previewUrl) && !previewFailed;

  if (!url) return null;

  const handleMouseEnter = () => {
    setIsHovering(true);
    const v = videoRef.current;
    if (v && canShowVideo) {
      v.currentTime = 0;
      v.play().catch(() => {
        // 忽略自动播放被浏览器拦截的错误
      });
    }
  };

  const handleMouseLeave = () => {
    setIsHovering(false);
    const v = videoRef.current;
    if (v) {
      v.pause();
    }
  };

  return (
    <div
      className="group mt-1 max-w-[400px] w-full rounded-xl border border-mew-darkest bg-mew-darker overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200"
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
        aria-label={title ? `Open video: ${title}` : 'Open video'}
      >
        {/* 1. 媒体区域 (16:9 比例) */}
        <div className="relative w-full aspect-video bg-black/20 overflow-hidden">
          {/* 视频层 */}
          {canShowVideo && (
            <video
              ref={videoRef}
              muted
              loop
              playsInline
              preload="none" // 懒加载，hover时才开始缓冲
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
                isHovering ? 'opacity-100' : 'opacity-0'
              }`}
              onError={() => setPreviewFailed(true)}
            >
              <source src={previewUrl} />
            </video>
          )}

          {/* 封面图层 (视频未播放时显示) */}
          <img
            src={thumbnailUrl}
            alt={title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-300 ${
               canShowVideo && isHovering ? 'opacity-0' : 'opacity-100'
            }`}
          />
          
          {/* 覆盖层：增加渐变让底部文字更清晰（如果文字要在图上），或者仅仅作为一个hover效果 */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />

          {/* 中央播放按钮图标 (仅在非Hover状态且支持预览时显示，增加点击欲望) */}
          <div className={`absolute inset-0 flex items-center justify-center pointer-events-none transition-all duration-300 ${
            isHovering ? 'opacity-0 scale-110' : 'opacity-80 scale-100'
          }`}>
             <div className="bg-black/40 rounded-full p-3 backdrop-blur-sm border border-white/20 shadow-lg">
                <Icon icon="mdi:play" width="32" height="32" className="text-white" />
             </div>
          </div>
        </div>

        {/* 2. 信息区域 */}
        <div className="p-3 bg-mew-darker group-hover:bg-mew-dark/30 transition-colors border-t border-mew-darkest/50">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-semibold text-mew-text leading-snug line-clamp-2 break-words group-hover:text-primary transition-colors">
                {title || 'Untitled Video'}
              </h3>
              
              <div className="mt-1.5 flex items-center gap-2 text-xs text-mew-textMuted">
                {hostname && (
                  <span className="truncate hover:text-mew-text transition-colors">{hostname}</span>
                )}
                {/* 如果你有发布时间，可以在这里加 */}
                {/* <span className="opacity-60">•</span>
                <span>Just now</span> */}
              </div>
            </div>

            {/* 跳转图标 */}
            <Icon
              icon="mdi:open-in-new"
              width="18"
              height="18"
              className="shrink-0 text-mew-textMuted/50 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all mt-0.5"
            />
          </div>
        </div>
      </a>
    </div>
  );
};
