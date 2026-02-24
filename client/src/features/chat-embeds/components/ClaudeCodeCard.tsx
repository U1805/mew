import React, { useEffect, useMemo, useState } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { MessagePayload } from '../../../shared/types';

interface ClaudeCodeCardProps {
  content?: string;
  payload?: MessagePayload;
}

const FOOTER_CALLOUT_TYPE = 'footer';
const calloutStartPattern = /^\s*>\s*\[!([a-zA-Z0-9_-]+)\]\s*([+-])?\s*(.*)$/;
const calloutQuoteLinePattern = /^\s*>\s?(.*)$/;

type CalloutOpenState = Record<string, boolean>;

function sanitizeCalloutType(rawType: string): string {
  const type = String(rawType || '').toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return type || 'note';
}

function defaultCalloutTitle(type: string): string {
  const t = sanitizeCalloutType(type);
  if (t === 'tip') return 'Tip';
  if (t === 'warning' || t === 'caution') return 'Warning';
  if (t === 'important') return 'Important';
  if (t === 'danger' || t === 'error') return 'Danger';
  if (t === 'success') return 'Success';
  if (t === 'question') return 'Question';
  return 'Note';
}

function rewriteObsidianCallouts(markdown: string, openState?: CalloutOpenState): string {
  const normalized = String(markdown || '').replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const out: string[] = [];
  let calloutIndex = 0;

  for (let i = 0; i < lines.length; ) {
    const line = lines[i];
    const match = line.match(calloutStartPattern);
    if (!match) {
      out.push(line);
      i += 1;
      continue;
    }

    const calloutType = sanitizeCalloutType(match[1]);
    const calloutKey = `callout-${calloutIndex++}`;
    const collapseMarker = (match[2] || '').trim();
    const defaultOpen = collapseMarker === '+';
    const resolvedOpen = openState && Object.prototype.hasOwnProperty.call(openState, calloutKey)
      ? !!openState[calloutKey]
      : defaultOpen;
    const titleRaw = (match[3] || '').trim();
    const title = titleRaw || defaultCalloutTitle(calloutType);

    const bodyLines: string[] = [];
    i += 1;
    while (i < lines.length) {
      const next = lines[i];
      const quoteMatch = next.match(calloutQuoteLinePattern);
      if (!quoteMatch) break;
      bodyLines.push(quoteMatch[1] || '');
      i += 1;
    }

    const bodyMarkdown = bodyLines.join('\n').trim();
    const titleHtml = marked.parseInline(title, { gfm: true, breaks: true, async: false }) as string;
    const bodyHtml = bodyMarkdown
      ? (marked.parse(bodyMarkdown, { gfm: true, breaks: true, async: false }) as string)
      : '';

    if (calloutType === FOOTER_CALLOUT_TYPE) {
      out.push(
        `<div data-callout data-callout-type="${calloutType}" data-callout-key="${calloutKey}">` +
          `<div data-callout-title>${titleHtml}</div>` +
          `<div data-callout-content>${bodyHtml}</div>` +
        `</div>`
      );
      continue;
    }

    out.push(
      `<details data-callout data-callout-type="${calloutType}" data-callout-key="${calloutKey}"${resolvedOpen ? ' open' : ''}>` +
        `<summary data-callout-title>${titleHtml}</summary>` +
        `<div data-callout-content>${bodyHtml}</div>` +
      `</details>`
    );
  }

  return out.join('\n');
}

export function renderClaudeCodeCardHtml(markdown: string, openState?: CalloutOpenState): string {
  const content = String(markdown || '').trim();
  if (!content) return '';

  const transformed = rewriteObsidianCallouts(content, openState);
  const rendered = marked.parse(transformed, {
    gfm: true,
    breaks: true,
    async: false,
  }) as string;

  const sanitized = DOMPurify.sanitize(rendered, {
    ALLOWED_TAGS: [
      'div',
      'details',
      'summary',
      'p',
      'br',
      'strong',
      'b',
      'em',
      'i',
      'code',
      'pre',
      'blockquote',
      'hr',
      'ul',
      'ol',
      'li',
      'a',
      'h1',
      'h2',
      'h3',
      'h4',
      'h5',
      'h6',
      'table',
      'thead',
      'tbody',
      'tr',
      'th',
      'td',
    ],
    ALLOWED_ATTR: [
      'href',
      'title',
      'target',
      'rel',
      'rowspan',
      'colspan',
      'align',
      'data-callout',
      'data-callout-type',
      'data-callout-key',
      'data-callout-title',
      'data-callout-content',
      'open',
    ],
    FORBID_TAGS: ['svg', 'math', 'style', 'script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
    ALLOW_DATA_ATTR: true,
  });

  try {
    const doc = new DOMParser().parseFromString(sanitized, 'text/html');
    doc.querySelectorAll('svg, math, script, iframe, object, embed').forEach((el) => el.remove());
    doc.querySelectorAll('a[href]').forEach((a) => {
      const raw = a.getAttribute('href') || '';
      const href = raw.trim();
      const isHttp = /^https?:\/\//i.test(href);
      const isMailto = /^mailto:/i.test(href);
      if (!href || !(isHttp || isMailto)) {
        a.removeAttribute('href');
      }
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });
    return doc.body.innerHTML;
  } catch {
    return sanitized;
  }
}

export const ClaudeCodeCard: React.FC<ClaudeCodeCardProps> = ({ content, payload }) => {
  const text = useMemo(() => {
    const fromContent = typeof content === 'string' ? content.trim() : '';
    if (fromContent) return fromContent;
    const fromPayload = typeof payload?.content === 'string' ? payload.content.trim() : '';
    return fromPayload;
  }, [content, payload?.content]);

  const [calloutOpenState, setCalloutOpenState] = useState<CalloutOpenState>({});

  useEffect(() => {
    setCalloutOpenState({});
  }, [text]);

  const html = useMemo(() => renderClaudeCodeCardHtml(text, calloutOpenState), [text, calloutOpenState]);
  if (!text) return null;

  const handleCardClick: React.MouseEventHandler<HTMLDivElement> = (e) => {
    e.stopPropagation();
    const target = e.target as HTMLElement;
    const summary = target.closest('summary[data-callout-title]') as HTMLElement | null;
    if (!summary) {
      return;
    }

    const details = summary.closest('details[data-callout][data-callout-key]') as HTMLDetailsElement | null;
    if (!details) {
      return;
    }

    const calloutKey = details.getAttribute('data-callout-key');
    if (!calloutKey) {
      return;
    }

    e.preventDefault();
    setCalloutOpenState((prev) => {
      const current = Object.prototype.hasOwnProperty.call(prev, calloutKey)
        ? !!prev[calloutKey]
        : details.hasAttribute('open');
      return {
        ...prev,
        [calloutKey]: !current,
      };
    });
  };

  return (
    <div className="w-full" onClick={handleCardClick}>
      <div
        className={[
          'text-[0.95rem] leading-[1.375rem] text-[#DBDEE1] break-words',
          '[&_p]:my-1',
          '[&_h1]:my-3 [&_h1]:text-xl [&_h1]:font-semibold',
          '[&_h2]:my-3 [&_h2]:text-lg [&_h2]:font-semibold',
          '[&_h3]:my-2 [&_h3]:text-base [&_h3]:font-semibold',
          '[&_hr]:my-3 [&_hr]:border-mew-divider',
          '[&_ul]:my-2 [&_ul]:ml-5 [&_ul]:list-disc',
          '[&_ol]:my-2 [&_ol]:ml-5 [&_ol]:list-decimal',
          '[&_li]:my-1',
          '[&_pre]:my-2 [&_pre]:p-3 [&_pre]:rounded [&_pre]:bg-mew-darkest/60 [&_pre]:overflow-x-hidden',
          '[&_code]:rounded [&_code]:bg-mew-darkest/60 [&_code]:px-1 [&_code]:py-0.5',
          '[&_pre_code]:bg-transparent [&_pre_code]:px-0 [&_pre_code]:py-0 [&_pre_code]:rounded-none [&_pre_code]:whitespace-pre-wrap [&_pre_code]:break-words [&_pre_code]:[overflow-wrap:anywhere]',
          '[&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-mew-divider [&_blockquote]:pl-3 [&_blockquote]:text-mew-textMuted',
          '[&_a]:text-mew-accent [&_a:hover]:underline',
          '[&_table]:my-3 [&_table]:w-full [&_table]:border-collapse [&_table]:text-sm',
          '[&_th]:border [&_th]:border-mew-divider [&_th]:bg-mew-darkest/50 [&_th]:px-2 [&_th]:py-1 [&_th]:text-left',
          '[&_td]:border [&_td]:border-mew-divider [&_td]:px-2 [&_td]:py-1',
          '[&_[data-callout]]:my-3 [&_[data-callout]]:rounded-md [&_[data-callout]]:border-l-4 [&_[data-callout]]:border-[#5865F2] [&_[data-callout]]:bg-[#5865F2]/10',
          '[&_[data-callout-title]]:cursor-pointer [&_[data-callout-title]]:select-none [&_[data-callout-title]]:px-3 [&_[data-callout-title]]:py-2 [&_[data-callout-title]]:font-semibold [&_[data-callout-title]]:text-[#AEBBFF]',
          '[&_[data-callout-content]]:px-3 [&_[data-callout-content]]:pb-2 [&_[data-callout-content]]:pt-0',
          '[&_[data-callout][data-callout-type=warning]]:border-[#ef4444] [&_[data-callout][data-callout-type=warning]]:bg-[#ef4444]/10',
          '[&_[data-callout][data-callout-type=warning]_[data-callout-title]]:text-[#fca5a5]',
          '[&_[data-callout][data-callout-type=caution]]:border-[#ef4444] [&_[data-callout][data-callout-type=caution]]:bg-[#ef4444]/10',
          '[&_[data-callout][data-callout-type=caution]_[data-callout-title]]:text-[#fca5a5]',
          '[&_[data-callout][data-callout-type=error]]:border-[#ef4444] [&_[data-callout][data-callout-type=error]]:bg-[#ef4444]/10',
          '[&_[data-callout][data-callout-type=error]_[data-callout-title]]:text-[#fca5a5]',
          '[&_[data-callout][data-callout-type=danger]]:border-[#ef4444] [&_[data-callout][data-callout-type=danger]]:bg-[#ef4444]/10',
          '[&_[data-callout][data-callout-type=danger]_[data-callout-title]]:text-[#fca5a5]',
          '[&_[data-callout][data-callout-type=footer]]:mt-3 [&_[data-callout][data-callout-type=footer]]:mb-0 [&_[data-callout][data-callout-type=footer]]:rounded-none [&_[data-callout][data-callout-type=footer]]:border-l-0 [&_[data-callout][data-callout-type=footer]]:border-t [&_[data-callout][data-callout-type=footer]]:border-mew-divider [&_[data-callout][data-callout-type=footer]]:bg-transparent',
          '[&_[data-callout][data-callout-type=footer]_[data-callout-title]]:px-0 [&_[data-callout][data-callout-type=footer]_[data-callout-title]]:py-2 [&_[data-callout][data-callout-type=footer]_[data-callout-title]]:text-xs [&_[data-callout][data-callout-type=footer]_[data-callout-title]]:font-medium [&_[data-callout][data-callout-type=footer]_[data-callout-title]]:text-mew-textMuted',
          '[&_[data-callout][data-callout-type=footer]_[data-callout-content]]:px-0 [&_[data-callout][data-callout-type=footer]_[data-callout-content]]:pb-0 [&_[data-callout][data-callout-type=footer]_[data-callout-content]]:pt-0 [&_[data-callout][data-callout-type=footer]_[data-callout-content]]:text-xs [&_[data-callout][data-callout-type=footer]_[data-callout-content]]:leading-5 [&_[data-callout][data-callout-type=footer]_[data-callout-content]]:text-mew-textMuted',
          '[&_[data-callout][data-callout-type=footer]_[data-callout-content]_p]:my-0',
        ].join(' ')}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};

export default ClaudeCodeCard;
