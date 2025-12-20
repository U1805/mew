import React, { useMemo } from 'react';
import { format } from 'date-fns';
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

function safeDateLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return format(d, 'yyyy-MM-dd HH:mm');
}

interface RssCardProps {
  payload: MessagePayload;
  fallbackTimestamp?: string;
}

export const RssCard: React.FC<RssCardProps> = ({ payload, fallbackTimestamp }) => {
  const title = typeof payload.title === 'string' ? payload.title.trim() : '';
  const url = typeof payload.url === 'string' ? payload.url.trim() : '';
  const summary = typeof payload.summary === 'string' ? payload.summary.trim() : '';
  const thumbnailUrl = typeof payload.thumbnail_url === 'string' ? payload.thumbnail_url.trim() : '';
  const feedTitle = typeof payload.feed_title === 'string' ? payload.feed_title.trim() : '';
  const publishedAt = safeDateLabel(payload.published_at) ?? safeDateLabel(fallbackTimestamp);

  const hostname = useMemo(() => safeHostname(url), [url]);
  const sourceLabel = feedTitle || payload.webhookName || hostname || 'RSS';

  if (!url) return null;

  return (
    <div
      className="group mt-1 max-w-[560px] rounded-lg border border-mew-darkest bg-mew-darker overflow-hidden shadow-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="block hover:bg-mew-dark/30 transition-colors"
        aria-label={title ? `Open RSS item: ${title}` : 'Open RSS item'}
      >
        <div className="flex">
          <div className="min-w-0 flex-1 p-3">
            <div className="flex items-center gap-2 text-xs text-mew-textMuted">
              <span className="font-medium truncate">{sourceLabel}</span>
              {hostname && (
                <>
                  <span className="opacity-60 select-none">•</span>
                  <span className="truncate">{hostname}</span>
                </>
              )}
              {publishedAt && (
                <>
                  <span className="opacity-60 select-none">•</span>
                  <span className="truncate">{publishedAt}</span>
                </>
              )}
            </div>

            {title && (
              <div className="mt-1 flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="text-mew-text font-semibold leading-5 line-clamp-2 break-words">
                    {title}
                  </div>
                </div>
                <Icon
                  icon="mdi:open-in-new"
                  width="16"
                  height="16"
                  className="shrink-0 text-mew-textMuted opacity-70 group-hover:opacity-100 transition-opacity"
                />
              </div>
            )}

            {summary && (
              <p className="mt-1 text-sm text-mew-textMuted leading-5 line-clamp-3 break-words">
                {summary}
              </p>
            )}
          </div>

          {thumbnailUrl && (
            <div className="w-28 bg-mew-darkest/40 flex-shrink-0">
              <img
                src={thumbnailUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            </div>
          )}
        </div>
      </a>
    </div>
  );
};

