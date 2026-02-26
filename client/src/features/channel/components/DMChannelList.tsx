import { useMemo, type MouseEvent } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { UserStatusFooter } from '../../users/components/UserStatusFooter';
import { usePresenceStore } from '../../../shared/stores/presenceStore';
import { useUIStore, useModalStore, useUnreadStore, useHiddenStore } from '../../../shared/stores';
import { useAuthStore } from '../../../shared/stores/authStore';
import { useDmChannels } from '../hooks/useDmChannels';
import { useI18n } from '../../../shared/i18n';

export const DMChannelList = () => {
  const { currentChannelId, setCurrentChannel } = useUIStore();
  const { openModal } = useModalStore();
  const { user } = useAuthStore();
  const { t } = useI18n();
  const onlineStatus = usePresenceStore((state) => state.onlineStatus);
  const unreadChannelIds = useUnreadStore(state => state.unreadChannelIds);
  const { hiddenDmChannelIds, addHiddenChannel } = useHiddenStore();

  const { data: dmChannels } = useDmChannels();

  const visibleDmChannels = useMemo(() => {
    if (!dmChannels) return [];
    return dmChannels.filter(channel => !hiddenDmChannelIds.has(channel._id));
  }, [dmChannels, hiddenDmChannelIds]);

  const handleRemoveDm = (e: MouseEvent, channelId: string) => {
    e.stopPropagation();
    if (useUIStore.getState().currentChannelId === channelId) {
      useUIStore.getState().setCurrentChannel(null);
    }

    addHiddenChannel(channelId);
  };

  return (
    <div className="w-full h-full bg-mew-darker flex flex-col border-r border-mew-darkest flex-shrink-0">
      <div className="h-12 shadow-sm flex items-center px-2 border-b border-mew-darkest shrink-0">
           <button
              className="w-full text-left px-2 py-1 rounded bg-mew-darkest text-mew-textMuted text-base hover:bg-[#1E1F22] transition-colors"
              onClick={() => openModal('findUser')}
           >
               {t('dm.search.placeholder')}
           </button>
      </div>
      <div className="p-2 flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex items-center px-2 py-2 rounded hover:bg-mew-dark text-mew-textMuted hover:text-mew-text cursor-pointer mb-4 transition-colors">
              <Icon icon="mdi:account-multiple" className="mr-3" width="26" height="26" />
              <span className="font-medium text-base">{t('dm.friends')}</span>
          </div>

          <div className="flex items-center justify-between px-2 mb-2 group">
              <div className="text-[15px] font-bold text-mew-textMuted uppercase hover:text-mew-text cursor-pointer">{t('dm.directMessages')}</div>
              <Icon
                  icon="mdi:plus"
                  className="text-mew-textMuted hover:text-mew-text cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => openModal('findUser')}
              />
          </div>

          {visibleDmChannels?.map(dm => {
               const otherUser = dm.recipients?.find(r => typeof r === 'object' && r._id !== user?._id) as any;
               const name = otherUser?.username || dm.name || t('dm.unknownUser');
               const isOnline = otherUser?._id && onlineStatus[otherUser._id] === 'online';
               const hasUnread = unreadChannelIds.has(dm._id);

               return (
                  <div
                      key={dm._id}
                      onClick={() => setCurrentChannel(dm._id)}
                      className={clsx(
                          "flex items-center px-2 py-2 rounded cursor-pointer mb-0.5 transition-colors group relative",
                          currentChannelId === dm._id 
                            ? "bg-mew-dark text-white" 
                            : hasUnread
                                ? "text-white hover:bg-mew-dark"
                                : "text-mew-textMuted hover:bg-mew-dark hover:text-mew-text"
                      )}
                  >
                      <div className="w-8 h-8 rounded-full bg-mew-accent mr-3 flex items-center justify-center flex-shrink-0 relative">
                          {otherUser?.avatarUrl ? (
                              <img src={otherUser.avatarUrl} className="w-full h-full rounded-full object-cover" />
                          ) : (
                              <Icon icon="mdi:account" className="text-white" />
                          )}
                          <div className={clsx(
                              "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-[2.5px] border-[#2B2D31]",
                              isOnline ? "bg-green-500" : "bg-gray-500"
                          )}></div>
                      </div>
                      
                      <div className="flex-1 min-w-0 flex items-center">
                          <span className="truncate flex-1 text-base font-normal">{name}</span>
                          {hasUnread && currentChannelId !== dm._id && (
                             <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 ml-2"></div>
                          )}
                      </div>

                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <div
                              className="cursor-pointer text-mew-textMuted hover:text-white"
                              title={t('dm.notificationSettings')}
                              onClick={(e) => { e.stopPropagation(); openModal('channelNotifications', { channel: dm }); }}
                          >
                              <Icon icon="mdi:bell-outline" width="16" />
                          </div>
                          <div
                             className="cursor-pointer text-mew-textMuted hover:text-white"
                             title={t('dm.remove')}
                             onClick={(e) => handleRemoveDm(e, dm._id)}
                          >
                             <Icon icon="mdi:close" width="16" />
                          </div>
                      </div>
                  </div>
               )
          })}
      </div>

      <UserStatusFooter />
    </div>
  );
};

