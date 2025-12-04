import React from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { Channel, ChannelType } from '../../../shared/types';
import { useAuthStore } from '../../../shared/stores/store';
import { usePresenceStore } from '../../../shared/stores/presenceStore';

interface ChatHeaderProps {
  channel: Channel | null;
  isMemberListOpen: boolean;
  toggleMemberList: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ channel, isMemberListOpen, toggleMemberList }) => {
  const { user } = useAuthStore();
  const onlineStatus = usePresenceStore((state) => state.onlineStatus);

  const isDM = channel?.type === ChannelType.DM;
  
  let title = channel?.name || 'channel';
  let otherUser: any = null;

  if (isDM && channel?.recipients) {
    otherUser = channel.recipients.find((r: any) => r._id !== user?._id);
    if (otherUser) {
        title = otherUser.username;
    }
  }

  const isOnline = otherUser && onlineStatus[otherUser._id] === 'online';

  return (
    <div className="h-12 border-b border-mew-darkest flex items-center px-4 shadow-sm flex-shrink-0 bg-mew-dark">
      <div className="text-mew-textMuted mr-2 flex items-center justify-center">
          {isDM ? (
              <Icon icon="mdi:at" width="24" height="24" />
          ) : (
              <Icon icon="mdi:pound" width="24" height="24" />
          )}
      </div>

      <span className="font-bold text-white mr-2">{title}</span>

      {isDM && otherUser && (
           <div className="flex items-center">
                <div className={clsx(
                    "w-2.5 h-2.5 rounded-full mr-2",
                    isOnline ? "bg-green-500" : "bg-gray-500"
                )}></div>
                {isOnline && <span className="text-xs text-mew-textMuted hidden sm:block">Online</span>}
           </div>
      )}

      {!isDM && (
          <span className="text-xs text-mew-textMuted border-l border-mew-textMuted pl-2 ml-2 hidden md:block truncate">
            Welcome to the beginning of the #{title} channel.
          </span>
      )}
      
      <div className="ml-auto flex items-center space-x-4 text-mew-textMuted">
        <Icon icon="mdi:bell" className="hover:text-mew-text cursor-pointer hidden sm:block" />
        <Icon icon="mdi:pin" className="hover:text-mew-text cursor-pointer hidden sm:block" />
        
        {/* Only show Member List toggle for Server Channels */}
        {!isDM && (
            <Icon
            icon="mdi:account-group"
            className={clsx("hover:text-mew-text cursor-pointer transition-colors", isMemberListOpen && "text-white")}
            onClick={toggleMemberList}
            />
        )}
        
        <div className="relative hidden lg:block">
          <input type="text" placeholder="Search" className="bg-mew-darker text-sm rounded px-2 py-0.5 w-36 transition-all focus:w-60 focus:outline-none text-mew-text" />
          <Icon icon="mdi:magnify" className="absolute right-1 top-1 text-xs" />
        </div>
      </div>
    </div>
  );
};

export default ChatHeader;
