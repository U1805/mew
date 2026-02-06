import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useModalStore, useUIStore } from '../../../shared/stores';
import { channelApi } from '../../../shared/services/api';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { useI18n } from '../../../shared/i18n';

export const DeleteChannelModal: React.FC = () => {
  const { t } = useI18n();
  const { closeModal, modalData } = useModalStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const channel = modalData?.channel;

  const handleConfirm = async () => {
    if (!currentServerId || !channel) return;

    setIsLoading(true);
    try {
      await channelApi.delete(currentServerId, channel._id);
      queryClient.setQueryData(['channels', currentServerId], (old: any[]) =>
        old?.filter(c => c._id !== channel._id) || []
      );
      closeModal();
    } catch (error) {
      console.error("Failed to delete channel:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!channel) return null;

  return (
    <ConfirmModal
      title={t('channel.delete.title')}
      description={t('channel.delete.description', { name: channel.name })}
      confirmText={t('channel.delete.confirm')}
      onConfirm={handleConfirm}
      onCancel={closeModal}
      isLoading={isLoading}
      isDestructive
    />
  );
};
