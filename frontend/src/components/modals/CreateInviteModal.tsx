import React, { useState, useEffect } from 'react';
import { useModalStore, useUIStore } from '../../store';
import { inviteApi } from '../../services/api';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { Invite } from '../../types';

export const CreateInviteModal: React.FC = () => {
  const { closeModal } = useModalStore();
  const { currentServerId } = useUIStore();

  const [createdInviteUrl, setCreatedInviteUrl] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  const handleCreateInvite = async () => {
      if (!currentServerId) return;
      try {
          const res = await inviteApi.create(currentServerId, {});
          const invite = res.data as Invite;
          setCreatedInviteUrl(`${window.location.origin}/invite/${invite.code}`);
      } catch (e) {
          console.error("Failed to create invite", e);
      }
  };

  useEffect(() => {
    handleCreateInvite();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
         <div className="bg-[#313338] w-full max-w-md rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in p-4">
             <div className="flex justify-between items-center mb-2">
                 <h2 className="text-sm font-bold text-white uppercase">Invite Friends</h2>
                 <Icon icon="mdi:close" className="text-mew-textMuted cursor-pointer hover:text-white" onClick={closeModal} />
             </div>
             <div className="text-mew-text text-sm mb-4">
                 Share this link with others to grant them access to this server.
             </div>
             <div className="relative">
                 <input
                    readOnly
                    value={createdInviteUrl || 'Generating...'}
                    className="w-full bg-[#1E1F22] text-white p-2.5 rounded border border-[#1E1F22] focus:border-mew-accent focus:outline-none text-sm font-medium"
                 />
                 <button
                    className={clsx(
                        "absolute right-1 top-1 h-[34px] px-4 rounded text-white text-sm font-medium transition-colors min-w-[70px]",
                        !createdInviteUrl ? "bg-[#404249] cursor-not-allowed" :
                        isCopied ? "bg-green-500 hover:bg-green-600" : "bg-mew-accent hover:bg-mew-accentHover"
                    )}
                    onClick={() => {
                        if (createdInviteUrl) {
                            navigator.clipboard.writeText(createdInviteUrl);
                            setIsCopied(true);
                            setTimeout(() => setIsCopied(false), 2000);
                        }
                    }}
                 >
                     {isCopied ? 'Copied' : 'Copy'}
                 </button>
             </div>
             <div className="text-xs text-mew-textMuted mt-2">
                 Your invite link expires in 7 days. <span className="text-mew-accent hover:underline cursor-pointer">Edit link</span>
             </div>
         </div>
    </div>
  );
};