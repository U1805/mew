import React, { useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import type { Attachment, MessagePayload } from '../../../shared/types';
import { AttachmentLightbox } from '../../chat-attachments/modals/AttachmentLightbox';
import { useI18n, type Locale } from '../../../shared/i18n';
import { formatDateTime, formatNumber } from '../../../shared/utils/dateTime';

function safeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

function safeDateLabel(value: unknown, locale: Locale): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return formatDateTime(d, locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  if (typeof value === 'string') {
    const s = value.trim();
    if (!s) return null;
    const asNum = Number(s);
    if (Number.isFinite(asNum)) return safeDateLabel(asNum, locale);
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return formatDateTime(d, locale, { dateStyle: 'medium', timeStyle: 'short' });
  }

  return null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
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

function formatPositiveCount(value: unknown, locale: Locale): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value <= 0) return null;
    return formatNumber(value, locale);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (Number.isFinite(n)) {
      if (n <= 0) return null;
      return formatNumber(n, locale);
    }
    return trimmed;
  }
  return null;
}

interface InstagramCardProps {
  payload: MessagePayload;
}

export const InstagramCard: React.FC<InstagramCardProps> = ({ payload }) => {
  const { t, locale } = useI18n();
  const id = safeString((payload as any).id);
  const username = safeString((payload as any).username);
  const fullName = safeString((payload as any).full_name);
  const content = safeString((payload as any).content) || safeString((payload as any).title);
  const biography = safeString((payload as any).biography);
  const s3ProfilePicUrl = safeString((payload as any).s3_profile_pic_url);
  const profilePicUrl = (s3ProfilePicUrl || safeString((payload as any).profile_pic_url)).trim();

  const isVerified = safeBoolean((payload as any).is_verified) ?? false;
  const isPrivate = safeBoolean((payload as any).is_private) ?? false;

  const likeCount = formatPositiveCount((payload as any).like_count, locale);
  const commentCount = formatPositiveCount((payload as any).comment_count, locale);
  const followersCount = formatPositiveCount((payload as any).followers_count, locale);

  const s3DisplayUrl = safeString((payload as any).s3_display_url);
  const s3ThumbnailUrl = safeString((payload as any).s3_thumbnail_url);
  const s3VideoUrl = safeString((payload as any).s3_video_url);

  const rawDisplayUrl = safeString((payload as any).display_url);
  const rawThumbnailUrl = safeString((payload as any).thumbnail_src);
  const rawVideoUrl = safeString((payload as any).video_url);
  const rawImages = toStringArray((payload as any).images);
  const s3Images = toStringArray((payload as any).s3_images);

  const displayUrl = (s3DisplayUrl || rawDisplayUrl || s3ThumbnailUrl || rawThumbnailUrl).trim();
  const thumbnailUrl = (s3ThumbnailUrl || rawThumbnailUrl || displayUrl).trim();
  const videoUrl = (s3VideoUrl || rawVideoUrl).trim();
  const images = useMemo(() => {
    const arr = s3Images.length > 0 ? s3Images : rawImages;
    if (arr.length > 0) return arr;
    if (!videoUrl && displayUrl) return [displayUrl];
    return [];
  }, [displayUrl, rawImages, s3Images, videoUrl]);

  const takenAtLabel = useMemo(() => safeDateLabel((payload as any).taken_at, locale), [locale, payload]);
  const profileUrl = useMemo(() => (username ? `https://www.instagram.com/${username}/` : ''), [username]);
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [previewAttachments, setPreviewAttachments] = useState<Attachment[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const makeImageAttachment = (imgUrl: string): Attachment => ({
    url: imgUrl,
    contentType: guessImageContentTypeFromUrl(imgUrl),
    filename: filenameFromUrl(imgUrl, 'image'),
    size: 0,
  });

  if (!username && !fullName && !displayUrl && !videoUrl && images.length === 0 && !content) return null;

  const showStats = Boolean(likeCount || commentCount || followersCount || takenAtLabel || isPrivate);

  return (
    <div
      // Discord风格：圆角、相对较暗的背景色、移除了边框（用阴影和背景色区分）
      className="relative group mt-1 max-w-[520px] rounded-lg bg-mew-darker overflow-hidden shadow-sm flex flex-col"
      onClick={(e) => e.stopPropagation()}
      data-card-type="instagram"
      data-instagram-id={id || undefined}
    >
      {/* 1. 顶部渐变指示条 */}
      <div className="h-1 w-full shrink-0 bg-gradient-to-r from-fuchsia-500 via-pink-500 to-amber-400" />

      {/* 内部容器，统一的 padding，移除所有的 border-t 分割线 */}
      <div className="flex flex-col p-3.5 gap-2.5 min-w-0 w-full">
        
        {/* 2. Provider 来源标识 */}
        <div className="flex items-center gap-1.5 text-xs font-medium text-mew-textMuted">
          <Icon icon="mdi:instagram" className="w-3.5 h-3.5 text-pink-400" />
          <span>Instagram</span>
        </div>

        {/* 3. 作者信息行 (更小的头像，文字横向紧凑排列) */}
        <div className="flex items-center gap-2 mt-0.5">
          {profilePicUrl ? (
            <img
              src={profilePicUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="w-5 h-5 rounded-full object-cover bg-mew-darkest"
            />
          ) : (
            <div className="w-5 h-5 rounded-full bg-mew-darkest flex items-center justify-center">
              <Icon icon="mdi:account" className="w-3 h-3 text-mew-textMuted" />
            </div>
          )}
          <div className="flex items-center gap-1 min-w-0">
            {profileUrl ? (
              <a
                href={profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-sm text-mew-text hover:underline truncate"
                onClick={(e) => e.stopPropagation()}
              >
                {fullName || username || t('instagram.nameFallback')}
              </a>
            ) : (
              <span className="font-semibold text-sm text-mew-text truncate">
                {fullName || username || t('instagram.nameFallback')}
              </span>
            )}
            
            {isVerified && (
              <Icon icon="mdi:check-decagram" className="w-3.5 h-3.5 text-blue-500 shrink-0" />
            )}
            
            {username && fullName && (
              <span className="text-sm text-mew-textMuted truncate">
                (@{username})
              </span>
            )}
          </div>
        </div>

        {/* 4. 文本内容 (Content / Bio) */}
        {(content || biography) && (
          <div className="text-sm leading-relaxed text-mew-text whitespace-pre-wrap break-words">
            {content || biography}
          </div>
        )}

        {/* 5. 媒体区域 (统一最大高度，圆角限定在外部) */}
        {(videoUrl || images.length > 0) && (
          <div className="mt-1 rounded-lg overflow-hidden border border-mew-darkest/40 bg-black/20 max-w-full">
            {videoUrl ? (
              <video
                controls
                preload="metadata"
                poster={thumbnailUrl || undefined}
                className="w-full max-h-[400px] object-contain"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <source src={videoUrl} type="video/mp4" />
              </video>
            ) : (
              <div>
                {images.length === 1 ? (
                  <img
                    src={images[0]}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full max-h-[400px] object-cover cursor-zoom-in hover:opacity-95 transition-opacity"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const attachment = makeImageAttachment(images[0]);
                      setPreviewAttachments([attachment]);
                      setPreviewIndex(0);
                      setPreviewAttachment(attachment);
                    }}
                  />
                ) : (
                  // 多图：仅外部由父元素提供圆角，内部间距为极细的 gap
                  <div className="grid grid-cols-2 gap-0.5 bg-mew-darkest/50">
                    {images.slice(0, 4).map((img, idx) => (
                      <img
                        key={img}
                        src={img}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full aspect-square object-cover cursor-zoom-in hover:opacity-95 transition-opacity"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const attachments = images.map(makeImageAttachment);
                          const currentIdx = attachments.findIndex((a) => a.url === img);
                          setPreviewAttachments(attachments);
                          setPreviewIndex(currentIdx >= 0 ? currentIdx : 0);
                          setPreviewAttachment(attachments[currentIdx >= 0 ? currentIdx : 0] ?? null);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 6. Footer 数据统计区 (改用图标+数字，更像Discord) */}
        {showStats && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-1 text-xs font-medium text-mew-textMuted">
            {likeCount && (
              <div className="flex items-center gap-1.5" title={t('instagram.likes', { count: likeCount })}>
                <Icon icon="mdi:heart" className="w-4 h-4 text-pink-500" />
                <span>{likeCount}</span>
              </div>
            )}
            
            {commentCount && (
              <div className="flex items-center gap-1.5" title={t('instagram.comments', { count: commentCount })}>
                <Icon icon="mdi:comment-outline" className="w-4 h-4" />
                <span>{commentCount}</span>
              </div>
            )}

            {followersCount && (
              <div className="flex items-center gap-1.5" title={t('instagram.followers', { count: followersCount })}>
                <Icon icon="mdi:account-group-outline" className="w-4 h-4" />
                <span>{followersCount}</span>
              </div>
            )}

            {/* 日期及隐私状态通常靠右或放在最后 */}
            <div className="flex items-center gap-2 ml-auto text-[11px] font-normal opacity-80">
              {isPrivate && (
                <span title={t('instagram.private')}>
                  <Icon icon="mdi:lock" className="w-3.5 h-3.5" />
                </span>
              )}
              {takenAtLabel && <span>{takenAtLabel}</span>}
            </div>
          </div>
        )}
      </div>

      {/* 图片预览 Lightbox */}
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
