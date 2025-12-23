import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { uploadApi, messageApi } from '../../../shared/services/api';
import { Attachment } from '../../../shared/types';
import { AttachmentImageEditor } from './AttachmentImageEditor';
import { AttachmentImageViewer } from './AttachmentImageViewer';

interface LightboxProps {
  attachment: Attachment;
  attachments?: Attachment[];
  initialIndex?: number;
  onClose: () => void;
  serverId?: string;
  channelId?: string;
}

export const AttachmentLightbox = ({ attachment, attachments, initialIndex, onClose, serverId, channelId }: LightboxProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  const resolvedAttachments = (attachments && attachments.length > 0) ? attachments : [attachment];
  const safeInitialIndex = (() => {
    if (typeof initialIndex === 'number' && Number.isFinite(initialIndex)) {
      const idx = Math.floor(initialIndex);
      return Math.min(Math.max(0, idx), resolvedAttachments.length - 1);
    }
    const found = resolvedAttachments.findIndex((a) => a.url === attachment.url);
    return found >= 0 ? found : 0;
  })();

  const [currentIndex, setCurrentIndex] = useState(safeInitialIndex);
  const currentAttachment = resolvedAttachments[currentIndex] ?? resolvedAttachments[0];

  useEffect(() => {
    setCurrentIndex((prev) => Math.min(Math.max(0, prev), resolvedAttachments.length - 1));
  }, [resolvedAttachments.length]);

  useEffect(() => {
    // 稍微延后设置可见性以触发过渡动画
    const timer = requestAnimationFrame(() => setIsVisible(true));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditing) handleClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(timer);
    };
  }, [isEditing]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 300);
  };

  const handleSend = async (blob: Blob) => {
    if (!channelId) {
      toast.error("Cannot send message: Channel ID missing.");
      return;
    }

    const formData = new FormData();
    const filename = `edited_${Date.now()}.png`;
    formData.append('file', blob, filename);

    const loadingToast = toast.loading('Uploading edited image...');

    try {
      const uploadRes = await uploadApi.uploadFile(channelId, formData);
      const key = uploadRes.data.key;

      const finalAttachment = {
        filename,
        contentType: 'image/png',
        key,
        size: blob.size,
      } as unknown as Attachment;

      await messageApi.send(serverId, channelId, {
        content: '',
        attachments: [finalAttachment],
      });

      toast.success('Image sent!', { id: loadingToast });
      handleClose();
    } catch (error) {
      console.error(error);
      toast.error('Failed to send image.', { id: loadingToast });
    }
  };

  const canNavigate = resolvedAttachments.length > 1;
  const goPrev = () => {
    if (!canNavigate || isEditing) return;
    setRotation(0);
    setCurrentIndex((i) => (i - 1 + resolvedAttachments.length) % resolvedAttachments.length);
  };

  const goNext = () => {
    if (!canNavigate || isEditing) return;
    setRotation(0);
    setCurrentIndex((i) => (i + 1) % resolvedAttachments.length);
  };

  // 2. 将 JSX 包裹在 createPortal 中，渲染到 document.body
  // 确保在客户端执行 (SSR 保护)
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className={clsx(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center select-none transition-opacity duration-300 ease-out",
        isVisible ? "opacity-100" : "opacity-0"
      )}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!isEditing) handleClose();
      }}
    >
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm"></div>

      <div
        className={clsx(
          "flex-1 w-full h-full relative overflow-hidden flex items-center justify-center transition-transform duration-300 ease-out",
          isVisible ? "scale-100" : "scale-95"
        )}
      >
        {isEditing ? (
          <AttachmentImageEditor
            src={currentAttachment.url}
            initialRotation={rotation}
            onCancel={() => setIsEditing(false)}
            onSend={handleSend}
          />
        ) : (
          <AttachmentImageViewer
            src={currentAttachment.url}
            rotation={rotation}
            setRotation={setRotation}
            onEdit={() => setIsEditing(true)}
            attachmentUrl={currentAttachment.url}
            onPrev={canNavigate ? goPrev : undefined}
            onNext={canNavigate ? goNext : undefined}
            onClose={handleClose}
          />
        )}
      </div>
    </div>,
    document.body
  );
};
