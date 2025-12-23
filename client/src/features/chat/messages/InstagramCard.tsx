import React, { useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import { format } from 'date-fns';
import type { Attachment, MessagePayload } from '../../../shared/types';
import { AttachmentLightbox } from './AttachmentLightbox';

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function safeDateLabel(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return format(d, 'yyyy-MM-dd HH:mm');
  }

  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    const asNum = Number(s);
    if (Number.isFinite(asNum)) return safeDateLabel(asNum);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return format(d, 'yyyy-MM-dd HH:mm');
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

function formatPositiveCount(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return null;
    return value.toLocaleString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (Number.isFinite(n)) {
      if (n <= 0) return null;
      return n.toLocaleString();
    }
    return trimmed;
  }
  return null;
}

interface InstagramCardProps {
  payload: MessagePayload;
}

export const InstagramCard: React.FC<InstagramCardProps> = ({ payload }) => {
  const id = safeString((payload as any).id);
  const username = safeString((payload as any).username);
  const fullName = safeString((payload as any).full_name);
  const biography = safeString((payload as any).biography);
  const profilePicUrl = safeString((payload as any).profile_pic_url);

  const isVerified = safeBoolean((payload as any).is_verified) ?? false;
  const isPrivate = safeBoolean((payload as any).is_private) ?? false;

  const likeCount = formatPositiveCount((payload as any).like_count);
  const commentCount = formatPositiveCount((payload as any).comment_count);
  const followersCount = formatPositiveCount((payload as any).followers_count);

  const s3DisplayUrl = safeString((payload as any).s3_display_url);
  const s3ThumbnailUrl = safeString((payload as any).s3_thumbnail_url);
  const s3VideoUrl = safeString((payload as any).s3_video_url);

  const rawDisplayUrl = safeString((payload as any).display_url);
  const rawThumbnailUrl = safeString((payload as any).thumbnail_src);
  const rawVideoUrl = safeString((payload as any).video_url);

  const displayUrl = (s3DisplayUrl || rawDisplayUrl || s3ThumbnailUrl || rawThumbnailUrl).trim();
  const thumbnailUrl = (s3ThumbnailUrl || rawThumbnailUrl || displayUrl).trim();
  const videoUrl = (s3VideoUrl || rawVideoUrl).trim();

  const takenAtLabel = useMemo(() => safeDateLabel((payload as any).taken_at), [payload]);
  const profileUrl = useMemo(() => (username ? `https://www.instagram.com/${username}/` : ''), [username]);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);

  if (!username && !fullName && !displayUrl && !videoUrl) return null;

  const showStats = Boolean(likeCount || commentCount || followersCount || takenAtLabel || isPrivate);

  return (
    <div
      className="group mt-1 max-w-[560px] rounded-xl border border-mew-darkest bg-mew-darker overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200"
      onClick={(e) => e.stopPropagation()}
      data-card-type="instagram"
      data-instagram-id={id || undefined}
    >
      <div className="h-1 w-full bg-gradient-to-r from-fuchsia-500 via-pink-500 to-amber-400" />

      <div className="p-3">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-full bg-mew-darkest/40 overflow-hidden flex items-center justify-center shrink-0">
            {profilePicUrl ? (
              <img
                src={profilePicUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              <Icon icon="mdi:account" width="20" height="20" className="text-mew-textMuted" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 min-w-0">
              <Icon icon="mdi:instagram" width="18" height="18" className="shrink-0 text-pink-400" />
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-semibold text-mew-text truncate">
                    {fullName || (username ? `@${username}` : 'Instagram')}
                  </span>
                  {isVerified && (
                    <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/25 shrink-0">
                      <Icon icon="mdi:check-decagram" width="14" height="14" />
                    </span>
                  )}
                </div>
                {username && (
                  <div className="text-xs text-mew-textMuted truncate">@{username}</div>
                )}
              </div>

              {profileUrl && (
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-auto inline-flex items-center gap-1 text-xs text-mew-textMuted hover:text-mew-text transition-colors shrink-0"
                  onClick={(e) => e.stopPropagation()}
                  aria-label={`Open Instagram profile: @${username}`}
                >
                  <span>Profile</span>
                  <Icon icon="mdi:open-in-new" width="14" height="14" />
                </a>
              )}
            </div>

            {biography && (
              <p className="mt-2 text-sm text-mew-textMuted leading-5 line-clamp-2 break-words">
                {biography}
              </p>
            )}
          </div>
        </div>
      </div>

      {(videoUrl || displayUrl) && (
        <div className="border-t border-mew-darkest/50 bg-black/10">
          {videoUrl ? (
            <div className="relative w-full bg-black">
              <video
                controls
                preload="metadata"
                poster={thumbnailUrl || undefined}
                className="w-full max-h-[520px] object-contain"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <source src={videoUrl} type="video/mp4" />
              </video>
            </div>
          ) : (
            <div className="p-2">
              <img
                src={displayUrl}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="w-full max-h-[520px] rounded-lg object-contain bg-black/30 cursor-zoom-in"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setPreviewAttachment({
                    url: displayUrl,
                    contentType: guessImageContentTypeFromUrl(displayUrl),
                    filename: filenameFromUrl(displayUrl, 'image'),
                    size: 0,
                  });
                }}
              />
            </div>
          )}
        </div>
      )}

      {showStats && (
        <div className="border-t border-mew-darkest/50 px-3 py-2 text-xs text-mew-textMuted flex flex-wrap gap-x-4 gap-y-1">
          {takenAtLabel && <span>{takenAtLabel}</span>}
          {isPrivate && (
            <span className="inline-flex items-center gap-1">
              <Icon icon="mdi:lock" width="14" height="14" />
              Private
            </span>
          )}
          {followersCount && <span>{followersCount} followers</span>}
          {likeCount && <span>{likeCount} likes</span>}
          {commentCount && <span>{commentCount} comments</span>}
        </div>
      )}

      {previewAttachment && (
        <AttachmentLightbox attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
      )}
    </div>
  );
};
