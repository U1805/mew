import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useModalStore, useUIStore } from '../../../shared/stores';
import { channelApi } from '../../../shared/services/api';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';

export const DeleteChannelModal: React.FC = () => {
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
      title="Delete Channel"
      description={`Are you sure you want to delete #${channel.name}? This cannot be undone.`}
      confirmText="Delete Channel"
      onConfirm={handleConfirm}
      onCancel={closeModal}
      isLoading={isLoading}
      isDestructive
    />
  );
};
