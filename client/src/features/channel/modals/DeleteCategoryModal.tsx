import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useModalStore, useUIStore } from '../../../shared/stores';
import { categoryApi } from '../../../shared/services/api';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { useI18n } from '../../../shared/i18n';

export const DeleteCategoryModal: React.FC = () => {
  const { t } = useI18n();
  const { closeModal, modalData } = useModalStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const category = modalData?.category;

  const handleConfirm = async () => {
    if (!category || !currentServerId) return;

    setIsLoading(true);
    try {
      await categoryApi.delete(category._id);
      queryClient.invalidateQueries({ queryKey: ['categories', currentServerId] });
      queryClient.invalidateQueries({ queryKey: ['channels', currentServerId] });
      closeModal();
    } catch (error) {
      console.error('Failed to delete category:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (!category) return null;

  return (
    <ConfirmModal
      title={t('category.delete.title')}
      description={t('category.delete.description', { name: category.name })}
      confirmText={t('category.delete.confirm')}
      onConfirm={handleConfirm}
      onCancel={closeModal}
      isLoading={isLoading}
      isDestructive
    />
  );
};
