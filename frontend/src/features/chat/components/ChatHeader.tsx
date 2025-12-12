import { useState, useEffect } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { Channel, ChannelType } from '../../../shared/types';
import { useAuthStore, useUIStore } from '../../../shared/stores';
import { usePresenceStore } from '../../../shared/stores/presenceStore';

interface ChatHeaderProps {
  channel: Channel | null;
  isMemberListOpen: boolean;
  toggleMemberList: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ channel, isMemberListOpen, toggleMemberList }) => {
  const { user } = useAuthStore();
  const onlineStatus = usePresenceStore((state) => state.onlineStatus);
  const { currentServerId, setSearchOpen, setSearchQuery, isSearchOpen } = useUIStore();

  const [inputValue, setInputValue] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchQuery(inputValue);
      if (inputValue.trim()) setSearchOpen(true);
    }, 300);

    return () => clearTimeout(timer);
  }, [inputValue, setSearchQuery, setSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) setInputValue('');
  }, [isSearchOpen]);

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
    <div className="h-12 border-b border-mew-darkest flex items-center px-4 shadow-sm flex-shrink-0 bg-mew-dark z-20">
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

        {!isDM && (
            <Icon
            icon="mdi:account-group"
            className={clsx("hover:text-mew-text cursor-pointer transition-colors", isMemberListOpen && "text-white")}
            onClick={toggleMemberList}
            />
        )}

        {currentServerId && (
            <div className={clsx("relative hidden lg:block transition-all", isSearchOpen ? "w-60" : "w-36 focus-within:w-60")}>
            <input 
                type="text" 
                placeholder="Search" 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onFocus={() => {
                    if (inputValue.trim()) setSearchOpen(true);
                }}
                className="bg-mew-darker text-sm rounded px-2 py-0.5 w-full transition-all focus:outline-none text-mew-text placeholder-mew-textMuted" 
            />
            <Icon icon="mdi:magnify" className="absolute right-1 top-1 text-xs pointer-events-none" />
            </div>
        )}
      </div>
    </div>
  );
};

export default ChatHeader;
