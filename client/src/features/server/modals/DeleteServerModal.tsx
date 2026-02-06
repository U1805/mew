import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useModalStore, useUIStore } from '../../../shared/stores';
import { serverApi } from '../../../shared/services/api';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { useI18n } from '../../../shared/i18n';

export const DeleteServerModal: React.FC = () => {
  const { t } = useI18n();
  const { closeModal, modalData } = useModalStore();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const server = modalData?.server;

  const handleConfirm = async () => {
    if (!server) return;

    setIsLoading(true);
    try {
      await serverApi.delete(server._id);
      useUIStore.getState().setCurrentServer(null);
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      closeModal();
    } catch (error) {
      console.error("Failed to delete server:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!server) return null;

  return (
    <ConfirmModal
      title={t('server.delete.title')}
      description={t('server.delete.description', { name: server.name })}
      confirmText={t('server.delete.confirm')}
      onConfirm={handleConfirm}
      onCancel={closeModal}
      isLoading={isLoading}
      isDestructive
    />
  );
};
