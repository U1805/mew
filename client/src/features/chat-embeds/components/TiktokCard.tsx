import React, { useMemo, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import type { Attachment, MessagePayload } from '../../../shared/types';
import { AttachmentLightbox } from '../../chat-attachments/modals/AttachmentLightbox';
import { useI18n, type Locale } from '../../../shared/i18n';
import { formatDateTime, formatNumber } from '../../../shared/utils/dateTime';

// --- 工具函数保持不变 ---
function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function formatCount(value: unknown, locale: Locale): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0) return null;
    return formatNumber(value, locale);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (Number.isFinite(n)) {
      if (n < 0) return null;
      return formatNumber(n, locale);
    }
    return trimmed;
  }
  return null;
}

function formatTiktokDate(dateVal: unknown, locale: Locale): string | null {
  if (typeof dateVal === 'number' && Number.isFinite(dateVal)) {
    const ms = dateVal > 1e12 ? dateVal : dateVal * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return formatDateTime(d, locale, { dateStyle: 'long', timeStyle: 'short' });
  }
  if (typeof dateVal === 'string') {
    const s = dateVal.trim();
    if (!s) return null;
    const asNum = Number(s);
    if (Number.isFinite(asNum)) return formatTiktokDate(asNum, locale);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return formatDateTime(d, locale, { dateStyle: 'long', timeStyle: 'short' });
  }
  return null;
}

function guessImageContentTypeFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    if (pathname.endsWith('.png')) return 'image/png';
    if (pathname.endsWith('.webp')) return 'image/webp';
    if (pathname.endsWith('.gif')) return 'image/gif';
    if (pathname.endsWith('.svg')) return 'image/svg+xml';
    if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  } catch {
    // ignore
  }
  return 'image/jpeg';
}

function filenameFromUrl(url: string, fallback: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split('/').filter(Boolean).pop();
    return last || fallback;
  } catch {
    return fallback;
  }
}

interface TiktokCardProps {
  payload: MessagePayload;
}

interface StatItemProps {
  icon: string;
  value: string | null;
  label: string;
}

const StatItem = React.memo(({ icon, value, label }: StatItemProps) => {
  if (!value) return null;
  return (
    <div className="flex flex-col items-center" aria-label={label}>
      <div className="p-1.5 text-white/95 drop-shadow-lg">
        <Icon icon={icon} width="24" height="24" />
      </div>
      <span className="text-[11px] font-bold text-white drop-shadow-md -mt-1">{value}</span>
    </div>
  );
});

export const TiktokCard: React.FC<TiktokCardProps> = ({ payload }) => {
  const { t, locale } = useI18n();

  // Data Extraction
  const id = safeString(payload.id);
  const url = safeString(payload.url);
  const title = safeString(payload.title);
  
  const profileName = safeString(payload.profile_name);
  const profileUsername = safeString(payload.profile_username);
  const profileUrl = safeString(payload.profile_url) || (profileUsername ? `https://www.tiktok.com/@${profileUsername}` : '');
  const profileAvatar = safeString(payload.s3_profile_avatar) || safeString(payload.profile_avatar);

  const videoUrl = safeString(payload.s3_video_url) || safeString(payload.video_url);
  const coverUrl = safeString(payload.s3_cover_url) || safeString(payload.cover_url);
  
  const audioName = safeString(payload.audio_name);
  const audioAuthor = safeString(payload.audio_author);

  const views = formatCount(payload.views, locale);
  const likes = formatCount(payload.likes, locale);
  const comments = formatCount(payload.comments, locale);
  const shares = formatCount(payload.shares, locale);
  const uploadDateLabel = useMemo(() => formatTiktokDate(payload.upload_date, locale), [locale, payload.upload_date]);

  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [previewAttachments, setPreviewAttachments] = useState<Attachment[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  const makeImageAttachment = (imgUrl: string): Attachment => ({
    url: imgUrl,
    contentType: guessImageContentTypeFromUrl(imgUrl),
    filename: filenameFromUrl(imgUrl, 'tiktok_cover'),
    size: 0,
  });

  if (!url && !videoUrl && !coverUrl && !title) {
    return null;
  }

  const openUrl = url || profileUrl;
  const displayName = profileName || (profileUsername ? `@${profileUsername}` : t('tiktok.nameFallback'));
  const audioLabel = [audioName, audioAuthor].filter(Boolean).join(' - ');
  const stats = { likes, comments, shares, views };

  const togglePlay = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.paused) {
      void videoRef.current.play();
    } else {
      videoRef.current.pause();
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (videoRef.current?.requestFullscreen) {
      void videoRef.current.requestFullscreen();
    }
  };

  return (
    <div
      className="group mt-1 max-w-[400px] rounded-xl border border-mew-darkest bg-mew-darker overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex flex-col">
        
        {/* Header: Provider + time */}
        <div className="px-3 pt-3 pb-1">
          <div className="flex items-center justify-between mb-1">
             <div className="flex items-center gap-1.5 text-xs text-mew-textMuted font-medium">
                <Icon icon="simple-icons:tiktok" className="text-mew-textMuted w-3 h-3" />
                <span>TikTok</span>
             </div>
             {uploadDateLabel && (
               <span className="text-[10px] text-mew-textMuted/60">{uploadDateLabel}</span>
             )}
          </div>
        </div>

        {/* Content Area: immersive video + overlays */}
        <div className="relative aspect-[9/16] w-full bg-black overflow-hidden">
          {(videoUrl || coverUrl) ? (
            <>
              {videoUrl ? (
                <video
                  ref={videoRef}
                  src={videoUrl}
                  poster={coverUrl || undefined}
                  loop
                  playsInline
                  preload="metadata"
                  className="w-full h-full object-contain cursor-pointer"
                  onClick={togglePlay}
                  onDoubleClick={handleDoubleClick}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              ) : (
                <div
                  className="w-full h-full relative cursor-zoom-in group/img"
                  onClick={(e) => {
                    e.stopPropagation();
                    const attachment = makeImageAttachment(coverUrl);
                    setPreviewAttachments([attachment]);
                    setPreviewIndex(0);
                    setPreviewAttachment(attachment);
                  }}
                >
                  <img
                    src={coverUrl}
                    alt="cover"
                    className="w-full h-full object-contain opacity-90 group-hover/img:opacity-100 transition-opacity"
                  />
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-black/40 rounded-full p-2 backdrop-blur-sm opacity-0 group-hover/img:opacity-100 transition-opacity">
                      <Icon icon="mdi:magnify-plus-outline" className="text-white w-6 h-6" />
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-mew-textMuted">
              <Icon icon="mdi:video-off-outline" width="32" />
            </div>
          )}

          {!isPlaying && videoUrl && (
            <button
              type="button"
              className="absolute inset-0 flex items-center justify-center"
              onClick={togglePlay}
              aria-label={t('common.play')}
            >
              <span className="bg-black/40 p-4 rounded-full backdrop-blur-sm">
                <Icon icon="mdi:play" className="text-white w-10 h-10" />
              </span>
            </button>
          )}

          <div className="absolute right-2 bottom-16 flex flex-col items-center gap-3 z-10">
            {profileUrl ? (
              <a
                href={profileUrl}
                target="_blank"
                rel="noreferrer"
                className="relative mb-1"
                onClick={(e) => e.stopPropagation()}
                aria-label={t('tiktok.openProfileAria', { username: profileUsername || profileName || t('tiktok.nameFallback') })}
              >
                {profileAvatar ? (
                  <img
                    src={profileAvatar}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-10 h-10 rounded-full border-2 border-white object-cover shadow-lg"
                  />
                ) : (
                  <span className="w-10 h-10 rounded-full border-2 border-white bg-black/50 flex items-center justify-center shadow-lg">
                    <Icon icon="mdi:account" className="w-5 h-5 text-white" />
                  </span>
                )}
                <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 bg-[#FE2C55] rounded-full p-0.5 shadow-sm">
                  <Icon icon="mdi:plus" className="text-white w-2 h-2" />
                </span>
              </a>
            ) : null}

            <StatItem icon="mdi:heart" value={stats.likes} label={t('tiktok.likes', { count: likes || '' })} />
            <StatItem icon="mdi:comment-processing" value={stats.comments} label={t('tiktok.comments', { count: comments || '' })} />
            <StatItem icon="mdi:share" value={stats.shares} label={t('tiktok.shares', { count: shares || '' })} />
            <StatItem icon="mdi:play" value={stats.views} label={t('tiktok.views', { count: views || '' })} />
          </div>

          <div className="absolute bottom-0 left-0 right-0 p-3 pt-10 bg-gradient-to-t from-black/80 via-black/40 to-transparent pointer-events-none">
            <div className="flex flex-col gap-1.5 max-w-[80%] pointer-events-auto">
              {profileUrl ? (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="block text-white font-bold text-[15px] leading-tight truncate">
                    {displayName}
                  </span>
                  <span className="block text-white/85 text-[12px] leading-tight truncate mt-0.5">
                    @{profileUsername || profileName}
                  </span>
                </a>
              ) : (
                <span>
                  <span className="block text-white font-bold text-[15px] leading-tight truncate">
                    {displayName}
                  </span>
                  <span className="block text-white/85 text-[12px] leading-tight truncate mt-0.5">
                    @{profileUsername || profileName || t('tiktok.nameFallback')}
                  </span>
                </span>
              )}

              {title && (
                <p className="text-white text-sm leading-snug line-clamp-3 mb-1 drop-shadow-sm">
                  {title}
                </p>
              )}

              {audioLabel && (
                <div className="flex items-center gap-2 text-white/90">
                  <Icon icon="mdi:music-note" className="w-3.5 h-3.5 animate-[spin_3s_linear_infinite]" />
                  <span className="text-xs font-medium truncate drop-shadow-md">
                    {audioLabel}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

      {previewAttachment && (
        <AttachmentLightbox
          attachment={previewAttachment}
          attachments={previewAttachments}
          initialIndex={previewIndex ?? undefined}
          onClose={() => {
            setPreviewAttachment(null);
            setPreviewAttachments([]);
            setPreviewIndex(null);
          }}
        />
      )}
    </div>
  );
};
