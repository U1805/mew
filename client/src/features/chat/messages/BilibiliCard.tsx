import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { Icon } from '@iconify/react';
import type { Attachment, MessagePayload } from '../../../shared/types';
import { AttachmentLightbox } from './AttachmentLightbox';

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

function toRecord(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, any>;
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  return trimmed;
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
    if (Number.isFinite(asNum)) {
      const ms = asNum > 1e12 ? asNum : asNum * 1000;
      const d = new Date(ms);
      if (Number.isNaN(d.getTime())) return null;
      return format(d, 'yyyy-MM-dd HH:mm');
    }
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

function makeImageAttachment(url: string): Attachment {
  const normalized = normalizeUrl(url);
  return {
    filename: filenameFromUrl(normalized, 'image.jpg'),
    contentType: guessImageContentTypeFromUrl(normalized),
    url: normalized,
    size: 0,
  };
}

function pickPrimaryUrl(payload: MessagePayload): string {
  const candidates = [
    payload.video_url,
    payload.article_url,
    payload.pgc_url,
    payload.live_url,
    payload.music_url,
    payload.url,
    payload.dynamic_url,
  ]
    .filter((v): v is string => typeof v === 'string')
    .map((v) => normalizeUrl(v))
    .filter(Boolean);
  return candidates[0] ?? '';
}

function pickCoverUrl(payload: MessagePayload): string {
  const s3 = typeof payload.s3_cover_url === 'string' ? payload.s3_cover_url : '';
  const raw = typeof payload.cover_url === 'string' ? payload.cover_url : '';
  return normalizeUrl((s3 || raw || '').trim());
}

function typeBadge(type: string): { label: string; tone: string } {
  switch (type) {
    case 'video':
      return { label: '视频', tone: 'bg-blue-500/15 text-blue-300 border-blue-500/25' };
    case 'article':
      return { label: '文章', tone: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/25' };
    case 'post':
      return { label: '动态', tone: 'bg-violet-500/15 text-violet-300 border-violet-500/25' };
    case 'forward':
      return { label: '转发', tone: 'bg-amber-500/15 text-amber-300 border-amber-500/25' };
    case 'live':
      return { label: '直播', tone: 'bg-rose-500/15 text-rose-300 border-rose-500/25' };
    case 'live_share':
      return { label: '直播间', tone: 'bg-rose-500/15 text-rose-300 border-rose-500/25' };
    case 'pgc':
      return { label: '剧集', tone: 'bg-pink-500/15 text-pink-300 border-pink-500/25' };
    case 'music':
      return { label: '音频', tone: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/25' };
    default:
      return { label: 'Bilibili', tone: 'bg-mew-dark/30 text-mew-textMuted border-mew-darkest/60' };
  }
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

type InlineEmoji = { text: string; url: string };

function readInlineEmojis(payload: unknown): InlineEmoji[] {
  const raw = Array.isArray((payload as any)?.emojis) ? ((payload as any).emojis as any[]) : [];
  return raw
    .map((e) => ({
      text: typeof e?.text === 'string' ? e.text : '',
      url: typeof e?.s3_icon_url === 'string' ? normalizeUrl(e.s3_icon_url) : (typeof e?.icon_url === 'string' ? normalizeUrl(e.icon_url) : ''),
    }))
    .filter((e) => e.text && e.url)
    .slice(0, 64);
}

function renderTextWithEmojis(text: string, emojis: InlineEmoji[]): React.ReactNode {
  if (!text) return null;
  if (!emojis || emojis.length === 0) return text;

  const emojiByToken = new Map<string, InlineEmoji>();
  for (const e of emojis) {
    if (!emojiByToken.has(e.text)) emojiByToken.set(e.text, e);
  }
  const tokens = Array.from(emojiByToken.keys());
  if (tokens.length === 0) return text;

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'g');
  const parts = text.split(pattern);

  return parts.map((part, idx) => {
    const emoji = emojiByToken.get(part);
    if (!emoji) return <React.Fragment key={idx}>{part}</React.Fragment>;
    return (
      <img
        key={`${emoji.url}-${idx}`}
        src={emoji.url}
        title={emoji.text || undefined}
        alt={emoji.text || ''}
        loading="lazy"
        referrerPolicy="no-referrer"
        className="inline-block h-5 w-5 align-[-0.2em] mx-0.5 rounded bg-mew-darkest/40"
      />
    );
  });
}

function BilibiliQuotedCard({ payload, authorHint }: { payload: Record<string, any>; authorHint?: string }) {
  const type = typeof payload.type === 'string' ? payload.type : '';
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const text =
    (typeof payload.text === 'string' ? payload.text.trim() : '') ||
    (typeof payload.summary === 'string' ? payload.summary.trim() : '') ||
    (typeof payload.description === 'string' ? payload.description.trim() : '');
  const url = typeof payload.dynamic_url === 'string' ? normalizeUrl(payload.dynamic_url) : '';
  const emojis = useMemo(() => readInlineEmojis(payload), [payload]);
  const textNode = useMemo(() => renderTextWithEmojis(text, emojis), [text, emojis]);
  const images = toStringArray(payload.s3_image_urls).length > 0 ? toStringArray(payload.s3_image_urls) : toStringArray(payload.image_urls);
  const coverUrl = typeof payload.s3_cover_url === 'string' ? normalizeUrl(payload.s3_cover_url) : (typeof payload.cover_url === 'string' ? normalizeUrl(payload.cover_url) : '');
  const badge = typeBadge(type);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const media = images.length > 0 ? images : coverUrl ? [coverUrl] : [];
  const mediaShown = media.slice(0, 4);
  const remaining = media.length - mediaShown.length;
  const mediaAttachments = media.map(makeImageAttachment);
  const previewAttachment = previewIndex === null ? null : (mediaAttachments[previewIndex] ?? null);

  return (
    <div
      className={clsx(
        'mt-2 rounded-lg border border-mew-darkest/70 bg-mew-dark/20 p-2',
        url ? 'cursor-pointer hover:bg-mew-dark/30 transition-colors' : ''
      )}
      role={url ? 'button' : undefined}
      tabIndex={url ? 0 : undefined}
      onClick={(e) => {
        if (!url) return;
        if (previewIndex !== null) return;
        e.preventDefault();
        e.stopPropagation();
        window.open(url, '_blank', 'noopener,noreferrer');
      }}
      onKeyDown={(e) => {
        if (!url) return;
        if (previewIndex !== null) return;
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault();
        e.stopPropagation();
        window.open(url, '_blank', 'noopener,noreferrer');
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-center gap-2">
          <span className={clsx('shrink-0 text-[11px] px-1.5 py-0.5 rounded border', badge.tone)}>{badge.label}</span>
          <span className="text-xs text-mew-textMuted truncate">{authorHint || '原动态'}</span>
        </div>
        {url && (
          <span
            role="button"
            tabIndex={0}
            className="shrink-0 text-mew-textMuted/70 hover:text-primary transition-colors"
            aria-label="Open original post"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.open(url, '_blank', 'noopener,noreferrer');
            }}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return;
              e.preventDefault();
              e.stopPropagation();
              window.open(url, '_blank', 'noopener,noreferrer');
            }}
          >
            <Icon icon="mdi:open-in-new" width="16" height="16" />
          </span>
        )}
      </div>

      {title && <div className="mt-2 text-sm font-semibold text-mew-text leading-snug break-words">{title}</div>}
      {text && <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-mew-textMuted">{textNode}</p>}

      {mediaShown.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-1 overflow-hidden rounded-md">
          {mediaShown.map((src, idx) => (
            <button
              key={`${src}-${idx}`}
              type="button"
              className="relative overflow-hidden bg-mew-darkest/40"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const found = media.findIndex((v) => v === src);
                setPreviewIndex(found >= 0 ? found : idx);
              }}
            >
              <img
                src={src}
                alt=""
                loading="lazy"
                referrerPolicy="no-referrer"
                className="h-20 w-full object-cover bg-mew-darkest/40"
              />
              {remaining > 0 && idx === mediaShown.length - 1 && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-sm font-semibold">
                  +{remaining}
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {previewAttachment && (
        <div
          role="presentation"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onKeyDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          <AttachmentLightbox
            attachment={previewAttachment}
            attachments={mediaAttachments}
            initialIndex={previewIndex ?? 0}
            onClose={() => setPreviewIndex(null)}
          />
        </div>
      )}
    </div>
  );
}

interface BilibiliCardProps {
  payload: MessagePayload;
}

export const BilibiliCard: React.FC<BilibiliCardProps> = ({ payload }) => {
  const type = typeof payload.type === 'string' ? payload.type : '';
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const text =
    (typeof payload.text === 'string' ? payload.text.trim() : '') ||
    (typeof payload.summary === 'string' ? payload.summary.trim() : '') ||
    (typeof payload.description === 'string' ? payload.description.trim() : '');

  const authorName = typeof payload.author_name === 'string' ? payload.author_name.trim() : '';
  const authorFace = typeof payload.author_face === 'string' ? normalizeUrl(payload.author_face) : '';

  const primaryUrl = pickPrimaryUrl(payload);
  const hostname = useMemo(() => safeHostname(primaryUrl), [primaryUrl]);
  const publishedAt = safeDateLabel(payload.published_at);
  const badge = typeBadge(type);

  const images = toStringArray(payload.s3_image_urls).length > 0 ? toStringArray(payload.s3_image_urls) : toStringArray(payload.image_urls);
  const coverUrl = pickCoverUrl(payload);

  const emojis = useMemo(() => readInlineEmojis(payload), [payload]);
  const textNode = useMemo(() => renderTextWithEmojis(text, emojis), [text, emojis]);

  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  const quoted = useMemo(() => toRecord((payload as any).original_post), [payload]);
  const quotedAuthor = typeof (payload as any).original_author === 'string' ? (payload as any).original_author.trim() : '';

  if (!primaryUrl && !title && !text) return null;

  const media = images.length > 0 ? images : coverUrl ? [coverUrl] : [];
  const mediaShown = media.slice(0, 4);
  const remaining = media.length - mediaShown.length;
  const mediaAttachments = media.map(makeImageAttachment);
  const previewAttachment = previewIndex === null ? null : (mediaAttachments[previewIndex] ?? null);

  return (
    <>
      <div
        className="group mt-1 max-w-[560px] rounded-xl border border-mew-darkest bg-mew-darker overflow-hidden shadow-sm hover:shadow-md transition-shadow duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <a
          href={primaryUrl || undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="block hover:bg-mew-dark/20 transition-colors"
          aria-label={title ? `Open Bilibili: ${title}` : 'Open Bilibili'}
          onClick={(e) => {
            if (!primaryUrl) {
              e.preventDefault();
              e.stopPropagation();
            }
          }}
        >
          <div className="p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex items-center gap-2">
                {authorFace ? (
                  <img
                    src={authorFace}
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
                    <span className="font-semibold text-mew-text truncate">{authorName || payload.webhookName || 'Bilibili'}</span>
                    <span className={clsx('shrink-0 text-[11px] px-1.5 py-0.5 rounded border', badge.tone)}>{badge.label}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-mew-textMuted truncate">
                    {hostname && <span className="truncate">{hostname}</span>}
                    {publishedAt && (
                      <>
                        <span className="opacity-60 select-none"> • </span>
                        <span className="truncate">{publishedAt}</span>
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

            {title && <div className="mt-2 text-mew-text font-semibold leading-5 break-words">{title}</div>}

            {text && (
              <p className="mt-1 whitespace-pre-wrap break-words text-[0.95rem] leading-[1.375rem] text-mew-textMuted">
                {textNode}
              </p>
            )}

            {mediaShown.length > 0 && (
              <div className={clsx('mt-2 overflow-hidden rounded-lg', mediaShown.length === 1 ? 'bg-mew-darkest/40' : '')}>
                {mediaShown.length === 1 ? (
                  <div
                    className={clsx(
                      'relative w-full overflow-hidden',
                      type === 'video' || type === 'live' || type === 'live_share' || type === 'pgc' ? 'aspect-video' : 'aspect-[4/3]'
                    )}
                  >
                    <img
                      src={mediaShown[0]}
                      alt=""
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      className="absolute inset-0 h-full w-full object-cover"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setPreviewIndex(0);
                      }}
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1">
                    {mediaShown.map((src, idx) => (
                      <button
                        key={`${src}-${idx}`}
                        type="button"
                        className="relative overflow-hidden bg-mew-darkest/40"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          const found = media.findIndex((v) => v === src);
                          setPreviewIndex(found >= 0 ? found : idx);
                        }}
                      >
                        <img
                          src={src}
                          alt=""
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          className="h-28 w-full object-cover"
                        />
                        {remaining > 0 && idx === mediaShown.length - 1 && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-sm font-semibold">
                            +{remaining}
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {quoted && <BilibiliQuotedCard payload={quoted} authorHint={quotedAuthor} />}
          </div>
        </a>
      </div>

      {previewAttachment && (
        <AttachmentLightbox
          attachment={previewAttachment}
          attachments={mediaAttachments}
          initialIndex={previewIndex ?? 0}
          onClose={() => setPreviewIndex(null)}
        />
      )}
    </>
  );
};
