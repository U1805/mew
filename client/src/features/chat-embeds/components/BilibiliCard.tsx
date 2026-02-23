import React, { useMemo, useState } from 'react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { Icon } from '@iconify/react';
import type { Attachment, MessagePayload } from '../../../shared/types';
import { AttachmentLightbox } from '../../chat-attachments/modals/AttachmentLightbox';

// --- Utility Functions (无变化) ---

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
    return Number.isNaN(d.getTime()) ? null : format(d, 'yyyy-MM-dd HH:mm');
  }
  return null;
}

function makeImageAttachment(url: string): Attachment {
  const normalized = normalizeUrl(url);
  return {
    filename: 'image.jpg',
    contentType: 'image/jpeg',
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
  ].filter((v): v is string => typeof v === 'string').map(normalizeUrl).filter(Boolean);
  return candidates[0] ?? '';
}

function pickCoverUrl(payload: MessagePayload): string {
  const s3 = typeof payload.s3_cover_url === 'string' ? payload.s3_cover_url : '';
  const raw = typeof payload.cover_url === 'string' ? payload.cover_url : '';
  return normalizeUrl((s3 || raw || '').trim());
}

function getEmbedColorClass(type: string): string {
  switch (type) {
    case 'video': return 'border-blue-500';
    case 'article': return 'border-emerald-500';
    case 'forward': return 'border-amber-500';
    case 'live':
    case 'live_share': return 'border-rose-500';
    case 'pgc': return 'border-pink-500';
    case 'music': return 'border-cyan-500';
    case 'post': return 'border-violet-500';
    default: return 'border-gray-500';
  }
}

function getTypeLabel(type: string): string {
  const map: Record<string, string> = {
    video: '视频', article: '专栏', post: '动态', forward: '转发',
    live: '直播', live_share: '直播间', pgc: '番剧', music: '音频',
  };
  return map[type] || 'Bilibili';
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
  for (const e of emojis) if (!emojiByToken.has(e.text)) emojiByToken.set(e.text, e);
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
        className="inline-block h-5 w-5 align-[-0.2em] mx-0.5"
      />
    );
  });
}

// --- Components ---

const MediaGrid = ({ images, onPreview }: { images: string[]; onPreview: (index: number) => void }) => {
  if (images.length === 0) return null;
  if (images.length === 1) {
    return (
      <div className="mt-3 overflow-hidden rounded-lg bg-black/10 max-w-full">
        <img
          src={images[0]} alt="" loading="lazy"
          className="max-h-[350px] w-full max-w-full object-cover cursor-pointer hover:opacity-95 transition-opacity"
          onClick={(e) => { e.stopPropagation(); onPreview(0); }}
        />
      </div>
    );
  }
  const displayImages = images.slice(0, 4);
  const remaining = images.length - 4;
  return (
    <div className="mt-3 grid grid-cols-2 gap-1 w-full max-w-[400px] overflow-hidden rounded-lg">
      {displayImages.map((src, idx) => (
        <div
          key={src}
          className="relative aspect-square overflow-hidden cursor-pointer bg-black/10 hover:brightness-110 transition-[filter]"
          onClick={(e) => { e.stopPropagation(); onPreview(idx); }}
        >
          <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
          {remaining > 0 && idx === 3 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 text-white font-medium text-lg">
              +{remaining}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

// 转发内容的内部卡片
function BilibiliQuotedCard({ payload, authorHint }: { payload: Record<string, any>; authorHint?: string }) {
  const type = typeof payload.type === 'string' ? payload.type : '';
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const text = (typeof payload.text === 'string' ? payload.text : typeof payload.summary === 'string' ? payload.summary : '').trim();
  const url = typeof payload.dynamic_url === 'string' ? normalizeUrl(payload.dynamic_url) : '';
  
  const emojis = useMemo(() => readInlineEmojis(payload), [payload]);
  const textNode = useMemo(() => renderTextWithEmojis(text, emojis), [text, emojis]);

  const images = toStringArray(payload.s3_image_urls).length > 0 ? toStringArray(payload.s3_image_urls) : toStringArray(payload.image_urls);
  const coverUrl = typeof payload.s3_cover_url === 'string' ? normalizeUrl(payload.s3_cover_url) : '';
  
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  
  const media = images.length > 0 ? images : coverUrl ? [coverUrl] : [];
  const mediaAttachments = media.map(makeImageAttachment);
  const previewAttachment = previewIndex === null ? null : (mediaAttachments[previewIndex] ?? null);

  return (
    <div className="mt-3 flex flex-col gap-1 rounded bg-mew-dark/30 p-3 border border-mew-darkest/50 text-sm">
      <div className="flex items-center justify-between gap-2 text-mew-textMuted text-xs font-medium">
         <div className="flex items-center gap-2 min-w-0">
            <Icon icon="mdi:format-quote-close" className="shrink-0 opacity-50" />
            <a href={url || undefined} target="_blank" rel="noopener noreferrer" className="truncate hover:underline">
              {authorHint || '原动态'}
            </a>
            <span className="shrink-0 text-[10px] text-mew-textMuted px-1.5 py-0.5 bg-mew-dark/50 rounded">{getTypeLabel(type)}</span>
         </div>
         {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="shrink-0 hover:text-mew-text transition-colors" title="打开原动态">
              <Icon icon="mdi:open-in-new" width={14} />
            </a>
         )}
      </div>

      {title && (
        <a href={url || undefined} target="_blank" rel="noopener noreferrer" className="font-bold text-mew-text hover:underline line-clamp-2">
          {title}
        </a>
      )}
      
      {text && (
        <div className="text-mew-textMuted/90 whitespace-pre-wrap break-words leading-relaxed line-clamp-3">
          {textNode}
        </div>
      )}

      <MediaGrid images={media} onPreview={setPreviewIndex} />

      {previewAttachment && (
        <AttachmentLightbox
          attachment={previewAttachment}
          attachments={mediaAttachments}
          initialIndex={previewIndex ?? 0}
          onClose={() => setPreviewIndex(null)}
        />
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
  const text = ((typeof payload.text === 'string' ? payload.text : '') ||
    (typeof payload.summary === 'string' ? payload.summary : '') ||
    (typeof payload.description === 'string' ? payload.description : '')
  ).trim();

  const authorName = typeof payload.author_name === 'string' ? payload.author_name.trim() : '';
  const authorFace = normalizeUrl(
    (typeof payload.s3_author_face === 'string' ? payload.s3_author_face : '')
    || (typeof payload.author_face === 'string' ? payload.author_face : '')
  );
  
  const primaryUrl = pickPrimaryUrl(payload);
  const hostname = useMemo(() => safeHostname(primaryUrl), [primaryUrl]);
  const publishedAt = safeDateLabel(payload.published_at);
  const typeLabel = getTypeLabel(type);
  const borderClass = getEmbedColorClass(type);

  const images = toStringArray(payload.s3_image_urls).length > 0 ? toStringArray(payload.s3_image_urls) : toStringArray(payload.image_urls);
  const coverUrl = pickCoverUrl(payload);
  const media = images.length > 0 ? images : coverUrl ? [coverUrl] : [];

  const emojis = useMemo(() => readInlineEmojis(payload), [payload]);
  const textNode = useMemo(() => renderTextWithEmojis(text, emojis), [text, emojis]);

  const quoted = useMemo(() => toRecord((payload as any).original_post), [payload]);
  const quotedAuthor = typeof (payload as any).original_author === 'string' ? (payload as any).original_author.trim() : '';
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  if (!primaryUrl && !title && !text && media.length === 0) return null;

  const mediaAttachments = media.map(makeImageAttachment);
  const previewAttachment = previewIndex === null ? null : (mediaAttachments[previewIndex] ?? null);

  return (
    <>
      <div className={clsx(
        "flex flex-col max-w-[520px] rounded bg-mew-darker overflow-hidden",
        "border-l-4", borderClass
      )}>
        <div className="p-4 flex flex-col gap-1.5">
          
          <div className="flex items-center gap-2 mb-1">
            {authorFace ? (
               <img src={authorFace} alt="" className="w-5 h-5 rounded-full bg-mew-darkest object-cover" />
            ) : (
               <div className="w-5 h-5 rounded-full bg-mew-darkest" />
            )}
            <span className="text-sm font-semibold text-mew-text">{authorName || payload.webhookName || 'Bilibili'}</span>
            <span className="text-xs text-mew-textMuted px-1.5 py-0.5 bg-mew-dark/50 rounded">{typeLabel}</span>
          </div>

          {title && (
            <a href={primaryUrl || '#'} target="_blank" rel="noopener noreferrer"
              className="text-base font-bold text-blue-400 hover:underline leading-snug break-words">
              {title}
            </a>
          )}

          {text && (
            <div className="text-sm text-mew-textMuted/90 whitespace-pre-wrap break-words leading-relaxed">
              {textNode}
            </div>
          )}

          <MediaGrid images={media} onPreview={setPreviewIndex} />

          {quoted && <BilibiliQuotedCard payload={quoted} authorHint={quotedAuthor} />}
          
          <div className="mt-2 flex items-center gap-2 text-[11px] text-mew-textMuted opacity-70 font-medium">
             {hostname && <span>{hostname}</span>}
             {hostname && publishedAt && <span>•</span>}
             {publishedAt && <span>{publishedAt}</span>}
             {primaryUrl && (
                <a href={primaryUrl} target="_blank" rel="noreferrer"
                   className="ml-auto hover:text-mew-text transition-colors" title="打开原链接">
                   <Icon icon="mdi:open-in-new" width={14} />
                </a>
             )}
          </div>

        </div>
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
