import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useModalStore } from '../../../shared/stores';
import { serverApi } from '../../../shared/services/api';

export const CreateServerModal: React.FC = () => {
  const { closeModal, openModal } = useModalStore();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setIsLoading(true);
    try {
      await serverApi.create({ name });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      closeModal();
    } catch (error) {
      console.error("Failed to create server:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#313338] w-full max-w-md rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in">
        <div className="p-4 pt-5 pb-3">
          <h2 className="text-xl font-bold text-white mb-2">Customize Your Server</h2>
          <p className="text-mew-textMuted text-sm leading-5">Give your new server a personality with a name and an icon. You can always change it later.</p>
        </div>

        <form onSubmit={handleSubmit} className="px-4">
          <div className="mb-4">
            <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Server Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium"
              placeholder="Enter name"
              autoFocus
            />
          </div>
          <div className="mb-2 text-center">
            <button
              type="button"
              className="text-mew-textMuted hover:text-white text-xs font-medium bg-[#2B2D31] px-4 py-2 rounded border border-[#1E1F22] hover:border-mew-textMuted transition-all w-full"
              onClick={() => { closeModal(); openModal('joinServer'); }}
            >
              Have an invite already? Join a Server
            </button>
          </div>
        </form>

        <div className="bg-[#2B2D31] p-4 flex justify-end items-center mt-2 space-x-3">
          <button type="button" onClick={closeModal} className="text-white hover:underline text-sm font-medium px-4">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={isLoading || !name.trim()} className="px-6 py-2 rounded-[3px] font-medium text-sm transition-colors text-white bg-mew-accent hover:bg-mew-accentHover disabled:opacity-50 disabled:cursor-not-allowed">
            Create
          </button>
        </div>
      </div>
    </div>
  );
};
