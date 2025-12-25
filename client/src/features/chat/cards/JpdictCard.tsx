import React, { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { MessagePayload } from '../../../shared/types';

interface JpdictCardProps {
  payload: MessagePayload;
}

export const JpdictCard: React.FC<JpdictCardProps> = ({ payload }) => {
  const content = typeof payload.content === 'string' ? payload.content.trim() : '';
  const html = useMemo(() => {
    if (!content) return '';

    const rendered = marked.parse(content, {
      gfm: true,
      breaks: true,
      async: false,
    }) as string;

    const sanitized = DOMPurify.sanitize(rendered, {
      ADD_TAGS: ['ruby', 'rt', 'rp'],
      ADD_ATTR: ['target', 'rel'],
    });

    try {
      const doc = new DOMParser().parseFromString(sanitized, 'text/html');
      doc.querySelectorAll('a[href]').forEach((a) => {
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener noreferrer');
      });
      return doc.body.innerHTML;
    } catch {
      return sanitized;
    }
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
