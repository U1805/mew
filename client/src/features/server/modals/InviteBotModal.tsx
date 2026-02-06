import React, { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import toast from 'react-hot-toast';
import { useModalStore, useUIStore } from '../../../shared/stores';
import { User } from '../../../shared/types';
import { serverBotApi } from '../../../shared/services/api';
import { useServerBotSearch } from '../hooks/useServerBotSearch';
import { useI18n } from '../../../shared/i18n';

export const InviteBotModal: React.FC = () => {
  const { t } = useI18n();
  const { closeModal } = useModalStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loadingBotUserId, setLoadingBotUserId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 100);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: searchResults, isFetching: isSearching } = useServerBotSearch(currentServerId, debouncedQuery);

  const handleInviteBot = async (botUser: User) => {
    if (!currentServerId) return;
    if (loadingBotUserId) return;

    setLoadingBotUserId(botUser._id);
    try {
      await serverBotApi.invite(currentServerId, botUser._id);
      toast.success(t('bot.invite.success'));
      queryClient.invalidateQueries({ queryKey: ['members', currentServerId] });
      closeModal();
    } catch (error: any) {
      const message = error?.response?.data?.message || t('bot.invite.failed');
      toast.error(message);
      console.error(t('bot.invite.failed'), error);
    } finally {
      setLoadingBotUserId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#313338] w-full max-w-lg rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in max-h-[600px]">
        <div className="p-4 pt-5">
          <h2 className="text-xl font-bold text-white mb-2">{t('bot.invite.title')}</h2>
          <p className="text-mew-textMuted text-sm">{t('bot.invite.subtitle')}</p>
        </div>

        <div className="px-4 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#1E1F22] text-white p-3 rounded border border-[#1E1F22] focus:border-mew-accent focus:outline-none font-medium placeholder-mew-textMuted"
            placeholder={t('bot.invite.searchPlaceholder')}
            autoFocus
          />
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar space-y-1">
          {isSearching ? (
            <div className="flex justify-center p-4 text-mew-textMuted">
              <Icon icon="mdi:loading" className="animate-spin" width="24" />
            </div>
          ) : searchResults?.length === 0 && debouncedQuery ? (
            <div className="text-center p-4 text-mew-textMuted">{t('bot.invite.none')}</div>
          ) : (
            searchResults?.map((botUser) => (
              <div
                key={botUser._id}
                className={`flex items-center justify-between p-2 rounded hover:bg-[#35373C] group cursor-pointer ${loadingBotUserId === botUser._id ? 'opacity-50' : ''}`}
                onClick={() => handleInviteBot(botUser)}
              >
                <div className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-mew-accent flex items-center justify-center text-white font-bold mr-3 overflow-hidden">
                    {botUser.avatarUrl ? (
                      <img src={botUser.avatarUrl} alt={botUser.username} className="w-full h-full object-cover" />
                    ) : (
                      botUser.username.substring(0, 1).toUpperCase()
                    )}
                  </div>
                  <div className="font-medium text-white">{botUser.username}</div>
                </div>
                <Icon icon="mdi:robot" className="text-mew-textMuted group-hover:text-white" />
              </div>
            ))
          )}

          {!debouncedQuery && !isSearching && (
            <div className="text-center p-8 text-mew-textMuted text-sm">{t('bot.invite.startTyping')}</div>
          )}
        </div>

        <div className="bg-[#2B2D31] p-4 flex justify-end">
          <button onClick={closeModal} className="text-white hover:underline text-sm font-medium">
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  );
};

