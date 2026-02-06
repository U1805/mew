import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { User } from '../../../shared/types';
import { channelApi } from '../../../shared/services/api';
import { useModalStore, useUIStore, useAuthStore } from '../../../shared/stores';
import { usePresenceStore } from '../../../shared/stores/presenceStore';
import { useUser } from '../hooks/useUser';
import { formatUserTag } from '../../../shared/utils/userTag';
import { useI18n } from '../../../shared/i18n';

export const UserProfileModal: React.FC = () => {
  const { closeModal, modalData } = useModalStore();
  const { user: currentUser } = useAuthStore();
  const { t } = useI18n();
  const onlineStatus = usePresenceStore((state) => state.onlineStatus);
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = useState(false);

  const initialUser = modalData?.user as User;

  const { data: user } = useUser(initialUser?._id, initialUser);

  if (!user) return null;

  const isOnline = onlineStatus[user._id] === 'online';
  const isSelf = currentUser?._id === user._id;
  const dmBlockedByBot = user.isBot && user.dmEnabled === false;

  const handleCreateDM = async (recipientId: string) => {
    if (!recipientId) return;
    setIsLoading(true);
    try {
        const res = await channelApi.createDM(recipientId);
        const channel = res.data;
        useUIStore.getState().setCurrentServer(null);
        useUIStore.getState().setCurrentChannel(channel._id);
        queryClient.invalidateQueries({ queryKey: ['dmChannels'] });
        closeModal();
    } catch (error) {
        console.error('Failed to create DM', error);
    } finally {
        setIsLoading(false);
    }
  };

  const joinedDate = user.createdAt && !isNaN(new Date(user.createdAt).getTime()) 
    ? format(new Date(user.createdAt), 'MMM d, yyyy') 
    : t('common.unknown');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
         <div className="bg-[#232428] w-[600px] rounded-lg shadow-2xl overflow-hidden animate-scale-in relative">
             <div className="h-[120px] bg-mew-accent"></div>
             <div className="px-4 pb-4 relative">
                 <div className="absolute -top-[50px] left-4 p-[6px] bg-[#232428] rounded-full">
                     <div className="w-[90px] h-[90px] rounded-full bg-[#1E1F22] flex items-center justify-center overflow-hidden">
                         {user.avatarUrl ? (
                         <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                         ) : (
                             <span className="text-2xl font-bold text-white">{user.username.substring(0, 1).toUpperCase()}</span>
                         )}
                     </div>
                     <div className={clsx(
                         "absolute bottom-1 right-1 w-6 h-6 rounded-full border-[4px] border-[#232428]",
                         isOnline ? "bg-green-500" : "bg-gray-500"
                     )}></div>
                 </div>

                 <div className="flex justify-end pt-3 mb-2">
                      {!isSelf && !dmBlockedByBot && (
                        <button
                          onClick={() => handleCreateDM(user._id)}
                          disabled={isLoading}
                          className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
                        >
                            {t('user.profile.sendMessage')}
                        </button>
                      )}
                      <button
                         onClick={closeModal}
                         className="ml-2 w-8 h-8 rounded-full bg-[#2B2D31] hover:bg-[#404249] flex items-center justify-center text-mew-textMuted hover:text-white transition-colors"
                      >
                          <Icon icon="mdi:close" />
                      </button>
                 </div>

                 <div className="mt-8 bg-[#111214] rounded-lg p-3">
                     <h2 className="text-xl font-bold text-white mb-0.5">{user.username}</h2>
                     <div className="text-sm text-mew-textMuted mb-4">{formatUserTag(user)}</div>

                     <div className="h-[1px] bg-mew-divider mb-3"></div>

                     <div className="mb-3">
                         <div className="text-xs font-bold text-mew-textMuted uppercase mb-1">{t('user.profile.memberSince')}</div>
                         <div className="text-sm text-mew-text">{joinedDate}</div>
                     </div>

                     <div>
                         <div className="text-xs font-bold text-mew-textMuted uppercase mb-1">{t('user.profile.note')}</div>
                         <input type="text" placeholder={t('user.profile.notePlaceholder')} className="w-full bg-transparent text-xs text-white placeholder-mew-textMuted focus:outline-none" />
                     </div>
                 </div>
             </div>
         </div>
    </div>
  )
}
