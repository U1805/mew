import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useModalStore, useUIStore } from '../../../shared/stores';
import { categoryApi } from '../../../shared/services/api';
import { useI18n } from '../../../shared/i18n';

export const CreateCategoryModal: React.FC = () => {
  const { t } = useI18n();
  const { closeModal } = useModalStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !currentServerId) return;

    setIsLoading(true);
    try {
      await categoryApi.create(currentServerId, { name });
      queryClient.invalidateQueries({ queryKey: ['categories', currentServerId] });
      closeModal();
    } catch (error) {
      console.error("Failed to create category:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeModal();
      }}
    >
      <div className="bg-[#313338] w-full max-w-md rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in">
        <div className="p-4 pt-5 pb-3">
          <h2 className="text-xl font-bold text-white mb-2">{t('category.create.title')}</h2>
        </div>

        <form onSubmit={handleSubmit} className="px-4">
          <div className="mb-4">
            <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">{t('category.create.name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium"
              placeholder={t('category.create.namePlaceholder')}
              autoFocus
            />
          </div>
        </form>

        <div className="bg-[#2B2D31] p-4 flex justify-end items-center mt-2 space-x-3">
          <button type="button" onClick={closeModal} className="text-white hover:underline text-sm font-medium px-4">
            {t('common.cancel')}
          </button>
          <button onClick={handleSubmit} disabled={isLoading || !name.trim()} className="px-6 py-2 rounded-[3px] font-medium text-sm transition-colors text-white bg-mew-accent hover:bg-mew-accentHover disabled:opacity-50 disabled:cursor-not-allowed">
            {t('category.create.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};
