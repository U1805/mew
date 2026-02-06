import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useModalStore, useUIStore } from '../../../shared/stores';
import { serverApi } from '../../../shared/services/api';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { useI18n } from '../../../shared/i18n';

export const LeaveServerModal: React.FC = () => {
  const { t } = useI18n();
  const { closeModal, modalData } = useModalStore();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const serverId = modalData?.serverId;

  const handleConfirm = async () => {
    if (!serverId) return;

    setIsLoading(true);
    try {
      await serverApi.leaveServer(serverId);
      queryClient.setQueryData(['servers'], (oldData: any[] | undefined) =>
        oldData ? oldData.filter(server => server._id !== serverId) : []
      );
      useUIStore.getState().setCurrentServer(null);
      closeModal();
    } catch (error) {
      console.error("Failed to leave server:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ConfirmModal
      title={t('server.leave.title')}
      description={t('server.leave.description')}
      confirmText={t('server.leave.confirm')}
      onConfirm={handleConfirm}
      onCancel={closeModal}
      isLoading={isLoading}
      isDestructive
    />
  );
};
