import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { channelApi } from '../../shared/services/api';
import { useUIStore, useAuthStore, useModalStore } from '../../shared/stores/store';
import { usePresenceStore } from '../../shared/stores/presenceStore';
import { Channel, ChannelType } from '../../shared/types/index';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { UserStatusFooter } from './UserStatusFooter';

export const DMChannelList: React.FC = () => {
  const { currentChannelId, setCurrentChannel } = useUIStore();
  const { openModal } = useModalStore();
  const { user } = useAuthStore();
  const onlineStatus = usePresenceStore((state) => state.onlineStatus);

  const { data: dmChannels } = useQuery({
      queryKey: ['dmChannels'],
      queryFn: async () => {
          try {
             const res = await channelApi.listDMs();
             return (res.data as Channel[]).filter(c => c.type === ChannelType.DM);
          } catch {
              return [];
          }
      },
      enabled: true // Always fetch DMs when this component is rendered
  });

  return (
    <div className="w-60 bg-mew-darker flex flex-col border-r border-mew-darkest flex-shrink-0">
      <div className="h-12 shadow-sm flex items-center px-2 border-b border-mew-darkest">
           <button
              className="w-full text-left px-2 py-1 rounded bg-mew-darkest text-mew-textMuted text-sm hover:bg-[#1E1F22] transition-colors"
              onClick={() => openModal('findUser')}
           >
               Find or start a conversation
           </button>
      </div>
      <div className="p-2 flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex items-center px-2 py-2 rounded hover:bg-mew-dark text-mew-textMuted hover:text-mew-text cursor-pointer mb-4 transition-colors">
              <Icon icon="mdi:account-multiple" className="mr-3" width="24" height="24" />
              <span className="font-medium">Friends</span>
          </div>

          <div className="flex items-center justify-between px-2 mb-2 group">
              <div className="text-xs font-bold text-mew-textMuted uppercase hover:text-mew-text cursor-pointer">Direct Messages</div>
              <Icon
                  icon="mdi:plus"
                  className="text-mew-textMuted hover:text-mew-text cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => openModal('findUser')}
              />
          </div>

          {dmChannels?.map(dm => {
               const otherUser = dm.recipients?.find(r => typeof r === 'object' && r._id !== user?._id) as any;
               const name = otherUser?.username || dm.name || 'Unknown User';
               const isOnline = otherUser?._id && onlineStatus[otherUser._id] === 'online';

               return (
                  <div
                      key={dm._id}
                      onClick={() => setCurrentChannel(dm._id)}
                      className={clsx(
                          "flex items-center px-2 py-2 rounded cursor-pointer mb-0.5 transition-colors group",
                          currentChannelId === dm._id ? "bg-mew-dark text-white" : "text-mew-textMuted hover:bg-mew-dark hover:text-mew-text"
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
                      <span className="font-medium truncate flex-1">{name}</span>
                      <div className="opacity-0 group-hover:opacity-100 cursor-pointer text-mew-textMuted hover:text-white" title="Remove DM">
                         <Icon icon="mdi:close" width="16" />
                      </div>
                  </div>
               )
          })}
      </div>

      <UserStatusFooter />
    </div>
  );
};