import React from 'react';
import { Embed } from '../../../shared/types';

interface UrlEmbedProps {
  embed: Embed;
}

export const UrlEmbed: React.FC<UrlEmbedProps> = ({ embed }) => {
  const hasImage = embed.images && embed.images.length > 0;
  const ariaLabel = embed.title || embed.siteName || embed.url;

  return (
    <a
      href={embed.url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      className="group flex max-w-lg mt-2 bg-mew-darker border-l-4 border-mew-accent rounded overflow-hidden shadow-sm transition-colors hover:bg-mew-dark focus:outline-none focus:ring-2 focus:ring-mew-accent focus:ring-offset-2 focus:ring-offset-mew-darker"
      onClick={(e) => e.stopPropagation()} // Prevent event bubbling
    >
      <div className="p-3 flex-1 min-w-0">
        {embed.siteName && (
          <div className="text-xs text-mew-textMuted font-medium truncate">
            {embed.siteName}
          </div>
        )}

        {embed.title && (
          <div className="text-mew-accent-hover underline-offset-2 group-hover:underline font-semibold block mt-1 truncate">
            {embed.title}
          </div>
        )}

        {embed.description && (
          <p className="text-sm text-mew-textMuted mt-1 line-clamp-3">
            {embed.description}
          </p>
        )}
      </div>

      {hasImage && (
        <div
          className="flex-shrink-0 w-24 h-auto ml-2 bg-cover bg-center"
          style={{ backgroundImage: `url(${embed.images![0]})` }}
          aria-hidden="true"
        />
      )}
    </a>
  );
};
