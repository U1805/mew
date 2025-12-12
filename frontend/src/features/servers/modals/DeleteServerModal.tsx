import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useModalStore, useUIStore } from '../../../shared/stores';
import { serverApi } from '../../../shared/services/api';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';

export const DeleteServerModal: React.FC = () => {
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
      title="Delete Server"
      description={`Are you sure you want to delete ${server.name}? This action cannot be undone.`}
      confirmText="Delete Server"
      onConfirm={handleConfirm}
      onCancel={closeModal}
      isLoading={isLoading}
      isDestructive
    />
  );
};
