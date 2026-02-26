import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useModalStore, useUIStore } from '../../../shared/stores';
import { messageApi } from '../../../shared/services/api';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { useI18n } from '../../../shared/i18n';
import { formatDateTime } from '../../../shared/utils/dateTime';

export const DeleteMessageModal: React.FC = () => {
  const { t, locale } = useI18n();
  const { closeModal, modalData } = useModalStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const message = modalData?.message;
  const author = modalData?.author;

  const handleConfirm = async () => {
    if (!message) return;

    setIsLoading(true);
    try {
      const serverId = currentServerId ? currentServerId : undefined;
      await messageApi.delete(serverId, message.channelId, message._id);

      queryClient.setQueryData(['messages', message.channelId], (old: any[] | undefined) => {
        if (!old) return [];
        return old.map(m => {
          if (m._id === message._id) {
            return {
              ...m,
              content: t('message.deleted'),
              retractedAt: new Date().toISOString(),
              attachments: [],
              payload: {},
            };
          }
          return m;
        });
      });

      closeModal();
    } catch (error) {
      console.error("Failed to delete message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!message) return null;

  return (
    <ConfirmModal
      title={t('message.delete.title')}
      description={t('message.delete.description')}
      confirmText={t('message.delete.confirm')}
      onConfirm={handleConfirm}
      onCancel={closeModal}
      isLoading={isLoading}
      isDestructive
    >
      <div className="border border-mew-divider/60 shadow-sm rounded bg-[#2B2D31] p-3 overflow-hidden mt-4">
        <div className="flex items-start">
          <div className="w-10 h-10 rounded-full bg-mew-accent flex items-center justify-center text-white font-semibold mr-3 flex-shrink-0 mt-0.5">
            {author?.avatarUrl ? (
              <img src={author.avatarUrl} alt={t('modal.preview')} className="w-full h-full rounded-full object-cover" />
            ) : (
              author?.username?.slice(0, 2).toUpperCase() || '?'
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center mb-1">
              <span className="font-bold text-white mr-1.5">{author?.username || t('common.unknown')}</span>
              <span className="text-xs text-mew-textMuted">
                {message.createdAt && !isNaN(new Date(message.createdAt).getTime())
                  ? formatDateTime(new Date(message.createdAt), locale, { dateStyle: 'medium', timeStyle: 'short' })
                  : ''}
              </span>
            </div>
            <p className="text-mew-text text-sm whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      </div>
    </ConfirmModal>
  );
};
