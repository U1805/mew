import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useModalStore, useUIStore } from '../../../shared/stores';
import { channelApi } from '../../../shared/services/api';

export const CreateChannelModal: React.FC = () => {
  const { closeModal, modalData } = useModalStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const categoryName = modalData?.categoryName;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !currentServerId) return;

    setIsLoading(true);
    try {
      await channelApi.create(currentServerId, { name, type: 'GUILD_TEXT', categoryId: modalData?.categoryId });
      queryClient.invalidateQueries({ queryKey: ['channels', currentServerId] });
      closeModal();
    } catch (error) {
      console.error("Failed to create channel:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#313338] w-full max-w-md rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in">
        <div className="p-4 pt-5 pb-3">
          <h2 className="text-xl font-bold text-white mb-2">Create Channel</h2>
          {categoryName && <p className="text-mew-textMuted text-sm leading-5">in {categoryName}</p>}
        </div>
        <form onSubmit={handleSubmit} className="px-4">
          <div className="mb-4">
            <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Channel Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium"
              placeholder="Enter channel name"
              autoFocus
            />
          </div>
        </form>

        <div className="bg-[#2B2D31] p-4 flex justify-end items-center mt-2 space-x-3">
          <button type="button" onClick={closeModal} className="text-white hover:underline text-sm font-medium px-4">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={isLoading || !name.trim()} className="px-6 py-2 rounded-[3px] font-medium text-sm transition-colors text-white bg-mew-accent hover:bg-mew-accentHover disabled:opacity-50 disabled:cursor-not-allowed">
            Create Channel
          </button>
        </div>
      </div>
    </div>
  );
};
