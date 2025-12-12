import { useEffect, useState } from 'react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { uploadApi, messageApi } from '../../../shared/services/api';
import { Attachment } from '../../../shared/types';
import { AttachmentImageEditor } from './AttachmentImageEditor';
import { AttachmentImageViewer } from './AttachmentImageViewer';

interface LightboxProps {
  attachment: Attachment;
  onClose: () => void;
  serverId?: string;
  channelId?: string;
}

export const AttachmentLightbox = ({ attachment, onClose, serverId, channelId }: LightboxProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setIsVisible(true));

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isEditing) handleClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
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

  return (
    <div
      className={clsx(
        "fixed inset-0 z-[100] flex flex-col items-center justify-center select-none transition-opacity duration-300 ease-out",
        isVisible ? "opacity-100" : "opacity-0"
      )}
      onClick={(e) => {
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
            src={attachment.url}
            initialRotation={rotation}
            onCancel={() => setIsEditing(false)}
            onSend={handleSend}
          />
        ) : (
          <AttachmentImageViewer
            src={attachment.url}
            rotation={rotation}
            setRotation={setRotation}
            onEdit={() => setIsEditing(true)}
            attachmentUrl={attachment.url}
            onClose={handleClose}
          />
        )}
      </div>
    </div>
  );
};

