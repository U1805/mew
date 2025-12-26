import { useState } from 'react';
import { Attachment } from '../../../shared/types';
import { Icon } from '@iconify/react';
import { formatFileSize } from '../../../shared/utils/file';
import { AttachmentLightbox } from '../modals/AttachmentLightbox';
import { VideoPlayer } from './VideoPlayer';

interface AttachmentListProps {
  attachments: Attachment[];
  serverId?: string;
  channelId?: string;
}

export const AttachmentList = ({ attachments, serverId, channelId }: AttachmentListProps) => {
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const imageAttachments = attachments.filter(a => a.contentType.startsWith('image/'));

  if (!attachments || attachments.length === 0) return null;

  return (
    <>
      <div className="flex flex-wrap gap-2 mt-2 max-w-[600px]">
        {attachments.map((attachment, index) => {
          const isImage = attachment.contentType.startsWith('image/');
          const isVideo = attachment.contentType.startsWith('video/');

          if (isVideo) {
            return (
              <VideoPlayer
                key={index}
                src={attachment.url}
                contentType={attachment.contentType}
                filename={attachment.filename}
              />
            )
          }

          if (isImage) {
            return (
              <div 
                key={index} 
                className="relative group overflow-hidden rounded-lg cursor-zoom-in"
                onClick={(e) => {
                  e.stopPropagation();
                  const idx = imageAttachments.findIndex(a => a.url === attachment.url);
                  setPreviewAttachment(attachment);
                  setPreviewIndex(idx >= 0 ? idx : null);
                }}
              >
                <img 
                  src={attachment.url} 
                  alt={attachment.filename}
                  className="max-h-[350px] max-w-full object-contain rounded-lg border border-[#1E1F22]/50 hover:opacity-90 transition-opacity"
                />
              </div>
            );
          }

          return (
            <div key={index} className="flex items-center p-3 bg-[#2B2D31] border border-[#1E1F22] rounded-[4px] max-w-[300px] w-full group">
              <div className="mr-3 text-mew-textMuted">
                 <Icon icon="mdi:file-document-outline" width="30" height="30" />
              </div>
              <div className="flex-1 min-w-0 mr-2">
                  <div className="text-sm font-medium text-mew-text truncate" title={attachment.filename}>{attachment.filename}</div>
                  <div className="text-xs text-mew-textMuted">{formatFileSize(attachment.size)}</div>
              </div>
              <a 
                  href={attachment.url} 
                  download={attachment.filename} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-mew-textMuted hover:text-white transition-colors"
                  title="Download"
                  onClick={(e) => e.stopPropagation()}
              >
                  <Icon icon="mdi:download" width="24" height="24" />
              </a>
            </div>
          );
        })}
      </div>

      {previewAttachment && (
        <AttachmentLightbox 
            attachment={previewAttachment} 
            attachments={imageAttachments}
            initialIndex={previewIndex ?? undefined}
            onClose={() => { setPreviewAttachment(null); setPreviewIndex(null); }}
            serverId={serverId}
            channelId={channelId}
        />
      )}
    </>
  );
};
