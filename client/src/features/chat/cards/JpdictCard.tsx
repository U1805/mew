import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { MessagePayload } from '../../../shared/types';

interface JpdictCardProps {
  payload: MessagePayload;
}

export function renderJpdictCardHtml(markdown: string): string {
  const content = String(markdown || '').trim();
  if (!content) return '';

  const rendered = marked.parse(content, {
    gfm: true,
    breaks: true,
    async: false,
  }) as string;

  const sanitized = DOMPurify.sanitize(rendered, {
    // Keep a tight allowlist. Add only what this card needs.
    ALLOWED_TAGS: [
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
      'ruby',
      'rt',
      'rp',
    ],
    ALLOWED_ATTR: ['href', 'title', 'target', 'rel'],
    FORBID_TAGS: ['svg', 'math', 'style', 'script', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick', 'onmouseover'],
    ALLOW_DATA_ATTR: false,
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

export const JpdictCard: React.FC<JpdictCardProps> = ({ payload }) => {
  const content = typeof payload.content === 'string' ? payload.content.trim() : '';
  const html = useMemo(() => {
    return renderJpdictCardHtml(content);
  }, [content]);

  if (!content) return null;

  return (
    <div
      className="group mt-1 max-w-[720px] rounded-lg border border-mew-darkest bg-mew-darker overflow-hidden shadow-sm"
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className={[
          'p-3 text-sm leading-6 text-mew-text break-words',
          '[&_p]:my-2',
          '[&_hr]:my-3 [&_hr]:border-mew-divider',
          '[&_ul]:my-2 [&_ul]:ml-5 [&_ul]:list-disc',
          '[&_ol]:my-2 [&_ol]:ml-5 [&_ol]:list-decimal',
          '[&_li]:my-1',
          '[&_pre]:my-2 [&_pre]:p-3 [&_pre]:rounded [&_pre]:bg-mew-darkest/60 [&_pre]:overflow-auto',
          '[&_code]:rounded [&_code]:bg-mew-darkest/60 [&_code]:px-1 [&_code]:py-0.5',
          '[&_blockquote]:my-2 [&_blockquote]:border-l-4 [&_blockquote]:border-mew-divider [&_blockquote]:pl-3 [&_blockquote]:text-mew-textMuted',
          '[&_a]:text-mew-accent [&_a:hover]:underline',
          '[&_ruby_rt]:text-[0.7em] [&_ruby_rt]:text-mew-textMuted',
        ].join(' ')}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
};

export default JpdictCard;
