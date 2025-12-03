import React, { useState, useEffect } from 'react';
import { useModalStore, useUIStore } from '../../shared/stores/store';
import { inviteApi } from '../../shared/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { Invite } from '../../shared/types/index';

export const JoinServerModal: React.FC = () => {
  const { closeModal, modalData } = useModalStore();
  const queryClient = useQueryClient();

  const [inviteCode, setInviteCode] = useState('');
  const [invitePreview, setInvitePreview] = useState<Invite | null>(null);
  const [joinError, setJoinError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleFetchInvite = async (code: string) => {
      setIsLoading(true);
      setJoinError('');
      try {
          const res = await inviteApi.get(code);
          setInvitePreview(res.data);
      } catch (e) {
          setJoinError("Invalid or expired invite code.");
          setInvitePreview(null);
      } finally {
          setIsLoading(false);
      }
  };

  const handleJoinServer = async () => {
      if (!invitePreview || !inviteCode) return;
      setIsLoading(true);
      try {
          await inviteApi.accept(inviteCode);
          await queryClient.invalidateQueries({ queryKey: ['servers'] });
          useUIStore.getState().setCurrentServer(invitePreview.serverId);
          closeModal();
      } catch (e) {
          setJoinError("Failed to join server.");
      } finally {
          setIsLoading(false);
      }
  };

  useEffect(() => {
    if (modalData?.code) {
      const code = modalData.code;
      setInviteCode(code);
      handleFetchInvite(code);
    }
  }, [modalData]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
         <div className="bg-[#313338] w-full max-w-md rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in p-6 text-center">
             <h2 className="text-2xl font-bold text-white mb-2">Join a Server</h2>
             <p className="text-mew-textMuted text-sm mb-6">Enter an invite below to join an existing server.</p>

             {!invitePreview ? (
                <div className="text-left">
                    <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Invite Link</label>
                    <input
                        type="text"
                        value={inviteCode}
                        onChange={(e) => {
                            const val = e.target.value;
                            const code = val.split('/').pop() || val;
                            setInviteCode(code);
                            if (code.length > 5) handleFetchInvite(code);
                        }}
                        className="w-full bg-[#1E1F22] text-white p-2.5 rounded border border-[#1E1F22] focus:border-mew-accent focus:outline-none text-sm font-medium mb-2"
                        placeholder="https://mew.com/invite/..."
                    />
                     {joinError && <div className="text-red-400 text-xs mb-2">{joinError}</div>}
                </div>
             ) : (
                <div className="bg-[#2B2D31] p-4 rounded mb-6 flex flex-col items-center animate-fade-in-up">
                    <div className="w-16 h-16 rounded-[20px] bg-mew-accent flex items-center justify-center text-white text-2xl font-bold mb-3 overflow-hidden">
                         {invitePreview.server?.avatarUrl ? (
                            <img src={invitePreview.server.avatarUrl} className="w-full h-full object-cover" />
                         ) : (
                            invitePreview.server?.name?.substring(0, 2).toUpperCase()
                         )}
                    </div>
                    <div className="text-white font-bold truncate max-w-full">{invitePreview.server?.name}</div>
                    <div className="text-mew-textMuted text-xs flex items-center mt-1">
                        <span className="w-2 h-2 rounded-full bg-mew-textMuted mr-1.5"></span>
                        {invitePreview.server?.memberCount ?? '?'} Members
                    </div>
                </div>
             )}

             <div className="flex justify-between items-center mt-2">
                 <button onClick={closeModal} className="text-white hover:underline text-sm font-medium">Back</button>
                 <button
                    onClick={invitePreview ? handleJoinServer : () => handleFetchInvite(inviteCode)}
                    disabled={isLoading || !inviteCode}
                    className={clsx(
                        "bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2.5 rounded-[3px] font-medium text-sm transition-colors",
                        (isLoading || !inviteCode) && "opacity-50 cursor-not-allowed"
                    )}
                 >
                     {invitePreview ? 'Join Server' : 'Find Server'}
                 </button>
             </div>
         </div>
    </div>
  );
};