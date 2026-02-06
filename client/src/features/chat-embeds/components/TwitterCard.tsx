import React, { useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import type { Attachment, MessagePayload } from '../../../shared/types';
import { AttachmentLightbox } from '../../chat-attachments/modals/AttachmentLightbox';
import { useI18n } from '../../../shared/i18n';

function safeHostname(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
}

function formatCount(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (Number.isFinite(n)) return n.toLocaleString();
    return trimmed;
  }
  return null;
}

function stripTimezoneOffset(createdAt: string): string {
  // Example from Twitter API: "Mon Dec 01 12:54:46 +0000 2025"
  // Desired:               "Mon Dec 01 12:54:46 2025"
  return createdAt.replace(/\s[+-]\d{4}\s(?=\d{4}$)/, ' ');
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

function toRecord(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, any>;
}

interface TwitterCardProps {
  payload: MessagePayload;
}

export const TwitterCard: React.FC<TwitterCardProps> = ({ payload }) => {
  const { t } = useI18n();
  const url = typeof payload.url === 'string' ? payload.url.trim() : '';
  const text = typeof payload.text === 'string' ? payload.text.trim() : '';
  const createdAt = typeof payload.created_at === 'string' ? payload.created_at.trim() : '';
  const isRetweet = typeof payload.is_retweet === 'boolean' ? payload.is_retweet : false;

  const authorName = typeof payload.author_name === 'string' ? payload.author_name.trim() : '';
  const authorHandle = typeof payload.author_handle === 'string' ? payload.author_handle.trim() : '';
  const authorAvatar = typeof payload.author_avatar === 'string' ? payload.author_avatar.trim() : '';

  const images = toStringArray(payload.s3_images).length > 0 ? toStringArray(payload.s3_images) : toStringArray(payload.images);
  const videoUrl = (typeof payload.s3_video_url === 'string' ? payload.s3_video_url.trim() : '') || (typeof payload.video_url === 'string' ? payload.video_url.trim() : '');
  const videoContentType = typeof payload.video_content_type === 'string' ? payload.video_content_type.trim() : 'video/mp4';
  const coverUrl = (typeof payload.s3_cover_url === 'string' ? payload.s3_cover_url.trim() : '') || (typeof payload.cover_url === 'string' ? payload.cover_url.trim() : '');

  const likeCount = formatCount(payload.like_count);
  const retweetCount = formatCount(payload.retweet_count);
  const replyCount = formatCount(payload.reply_count);
  const viewCount = formatCount(payload.view_count);

  const hostname = useMemo(() => safeHostname(url), [url]);
  const formattedCreatedAt = useMemo(() => (createdAt ? stripTimezoneOffset(createdAt) : ''), [createdAt]);

  const makeImageAttachment = (imgUrl: string): Attachment => ({
    url: imgUrl,
    contentType: guessImageContentTypeFromUrl(imgUrl),
    filename: filenameFromUrl(imgUrl, 'image'),
    size: 0,
  });

  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [previewAttachments, setPreviewAttachments] = useState<Attachment[]>([]);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const quotedPayload = useMemo(() => {
    const candidate = (payload as any).quoted_tweet ?? (payload as any).quotedTweet;
    return toRecord(candidate);
  }, [payload]);

  const quotedUrl = typeof quotedPayload?.url === 'string' ? quotedPayload.url.trim() : '';
  const quotedText = typeof quotedPayload?.text === 'string' ? quotedPayload.text.trim() : '';
  const quotedCreatedAt = typeof quotedPayload?.created_at === 'string' ? quotedPayload.created_at.trim() : '';
  const quotedAuthorName = typeof quotedPayload?.author_name === 'string' ? quotedPayload.author_name.trim() : '';
  const quotedAuthorHandle = typeof quotedPayload?.author_handle === 'string' ? quotedPayload.author_handle.trim() : '';
  const quotedAuthorAvatar = typeof quotedPayload?.author_avatar === 'string' ? quotedPayload.author_avatar.trim() : '';
  const quotedImages = quotedPayload
    ? (toStringArray(quotedPayload.s3_images).length > 0 ? toStringArray(quotedPayload.s3_images) : toStringArray(quotedPayload.images))
    : [];

  if (!url) return null;

  const showStats = Boolean(likeCount || retweetCount || replyCount || viewCount);

  return (
    <div
      className="group mt-1 max-w-[560px] rounded-xl border border-mew-darkest bg-mew-darker overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200"
      onClick={(e) => e.stopPropagation()}
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:bg-mew-dark/30 transition-colors"
        aria-label={text ? t('twitter.openTweetAria', { text }) : t('twitter.openTweet')}
      >
        <div className="p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0">
              {authorAvatar ? (
                <img
                  src={authorAvatar}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="h-9 w-9 rounded-full object-cover bg-mew-darkest"
                />
              ) : (
                <div className="h-9 w-9 rounded-full bg-mew-darkest" />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="font-semibold text-mew-text truncate">{authorName || payload.webhookName || t('twitter.x')}</span>
                  {authorHandle && <span className="text-sm text-mew-textMuted truncate">@{authorHandle}</span>}
                  {isRetweet && (
                    <span className="text-[11px] text-mew-textMuted shrink-0 border border-mew-darkest rounded px-1 py-0.5">
                      RT
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-xs text-mew-textMuted truncate">
                  {hostname && <span className="truncate">{hostname}</span>}
                  {createdAt && (
                    <>
                      <span className="opacity-60 select-none"> • </span>
                      <span className="truncate">{formattedCreatedAt}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <Icon
              icon="mdi:open-in-new"
              width="18"
              height="18"
              className="shrink-0 text-mew-textMuted/60 group-hover:text-primary transition-colors mt-1"
            />
          </div>

          {text && (
            <p className="mt-2 whitespace-pre-wrap break-words text-[0.95rem] leading-[1.375rem] text-mew-text">
              {text}
            </p>
          )}

          {quotedPayload && (quotedText || quotedUrl) && (
            <div className="mt-2 rounded-lg border border-mew-darkest/70 bg-mew-dark/20 p-2">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {quotedAuthorAvatar ? (
                    <img
                      src={quotedAuthorAvatar}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="h-7 w-7 rounded-full object-cover bg-mew-darkest"
                    />
                  ) : (
                    <div className="h-7 w-7 rounded-full bg-mew-darkest" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-sm font-semibold text-mew-text truncate">{quotedAuthorName || t('twitter.x')}</span>
                      {quotedAuthorHandle && <span className="text-xs text-mew-textMuted truncate">@{quotedAuthorHandle}</span>}
                    </div>
                    {quotedCreatedAt && (
                      <div className="mt-0.5 text-[11px] text-mew-textMuted truncate">{stripTimezoneOffset(quotedCreatedAt)}</div>
                    )}
                  </div>
                </div>

                {quotedUrl && (
                  <span
                    role="button"
                    tabIndex={0}
                    className="shrink-0 text-mew-textMuted/70 hover:text-primary transition-colors mt-0.5"
                    aria-label={t('twitter.openQuotedTweet')}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      window.open(quotedUrl, '_blank', 'noopener,noreferrer');
                    }}
                    onKeyDown={(e) => {
                      if (e.key !== 'Enter' && e.key !== ' ') return;
                      e.preventDefault();
                      e.stopPropagation();
                      window.open(quotedUrl, '_blank', 'noopener,noreferrer');
                    }}
                  >
                    <Icon icon="mdi:open-in-new" width="16" height="16" />
                  </span>
                )}
              </div>

              {quotedText && (
                <p className="mt-2 whitespace-pre-wrap break-words text-[0.9rem] leading-[1.3rem] text-mew-text">
                  {quotedText}
                </p>
              )}

              {quotedImages.length > 0 && (
                <div className="mt-2">
                  {quotedImages.length === 1 ? (
                    <img
                      src={quotedImages[0]}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="w-full max-h-[260px] rounded-md object-cover bg-black/20 cursor-zoom-in"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const imgUrl = quotedImages[0];
                        const attachment = makeImageAttachment(imgUrl);
                        setPreviewAttachments([attachment]);
                        setPreviewIndex(0);
                        setPreviewAttachment(attachment);
                      }}
                    />
                  ) : (
                    <div className="grid grid-cols-2 gap-1">
                      {quotedImages.slice(0, 4).map((img) => (
                        <img
                          key={img}
                          src={img}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="w-full aspect-square rounded-md object-cover bg-black/20 cursor-zoom-in"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            const attachments = quotedImages.map(makeImageAttachment);
                            const idx = attachments.findIndex((a) => a.url === img);
                            setPreviewAttachments(attachments);
                            setPreviewIndex(idx >= 0 ? idx : 0);
                            setPreviewAttachment(attachments[idx >= 0 ? idx : 0] ?? null);
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {(videoUrl || images.length > 0) && (
          <div className="border-t border-mew-darkest/50 bg-black/10">
            {videoUrl ? (
              <div className="relative w-full bg-black">
                <video
                  controls
                  preload="metadata"
                  poster={coverUrl || undefined}
                  className="w-full max-h-[420px] object-contain"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                >
                  <source src={videoUrl} type={videoContentType || 'video/mp4'} />
                </video>
              </div>
            ) : (
              <div className={images.length === 1 ? 'p-2' : 'p-2'}>
                {images.length === 1 ? (
                  <img
                    src={images[0]}
                    alt=""
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="w-full max-h-[420px] rounded-lg object-cover bg-black/30 cursor-zoom-in"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const imgUrl = images[0];
                      const attachment = makeImageAttachment(imgUrl);
                      setPreviewAttachments([attachment]);
                      setPreviewIndex(0);
                      setPreviewAttachment(attachment);
                    }}
                  />
                ) : (
                  <div className="grid grid-cols-2 gap-1">
                    {images.slice(0, 4).map((img) => (
                      <img
                        key={img}
                        src={img}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        className="w-full aspect-square rounded-md object-cover bg-black/20 cursor-zoom-in"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const attachments = images.map(makeImageAttachment);
                          const idx = attachments.findIndex((a) => a.url === img);
                          setPreviewAttachments(attachments);
                          setPreviewIndex(idx >= 0 ? idx : 0);
                          setPreviewAttachment(attachments[idx >= 0 ? idx : 0] ?? null);
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {showStats && (
          <div className="border-t border-mew-darkest/50 px-3 py-2 text-xs text-mew-textMuted flex flex-wrap gap-x-4 gap-y-1">
            {replyCount && <span>{t('twitter.replies', { count: replyCount })}</span>}
            {retweetCount && <span>{t('twitter.reposts', { count: retweetCount })}</span>}
            {likeCount && <span>{t('twitter.likes', { count: likeCount })}</span>}
            {viewCount && <span>{t('twitter.views', { count: viewCount })}</span>}
          </div>
        )}
      </a>

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
