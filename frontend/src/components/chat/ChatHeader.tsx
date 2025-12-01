import React from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { Channel } from '../../types';

interface ChatHeaderProps {
  channel: Channel | null;
  isMemberListOpen: boolean;
  toggleMemberList: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ channel, isMemberListOpen, toggleMemberList }) => {
  return (
    <div className="h-12 border-b border-mew-darkest flex items-center px-4 shadow-sm flex-shrink-0 bg-mew-dark">
      <Icon icon="mdi:pound" className="text-mew-textMuted mr-2" width="24" height="24" />
      <span className="font-bold text-white mr-2">{channel?.name || 'channel'}</span>
      <span className="text-xs text-mew-textMuted border-l border-mew-textMuted pl-2 ml-2 hidden md:block truncate">
        Welcome to the beginning of the #{channel?.name || 'channel'} channel.
      </span>
      <div className="ml-auto flex items-center space-x-4 text-mew-textMuted">
        <Icon icon="mdi:bell" className="hover:text-mew-text cursor-pointer hidden sm:block" />
        <Icon icon="mdi:pin" className="hover:text-mew-text cursor-pointer hidden sm:block" />
        <Icon
          icon="mdi:account-group"
          className={clsx("hover:text-mew-text cursor-pointer transition-colors", isMemberListOpen && "text-white")}
          onClick={toggleMemberList}
        />
        <div className="relative hidden lg:block">
          <input type="text" placeholder="Search" className="bg-mew-darker text-sm rounded px-2 py-0.5 w-36 transition-all focus:w-60 focus:outline-none text-mew-text" />
          <Icon icon="mdi:magnify" className="absolute right-1 top-1 text-xs" />
        </div>
      </div>
    </div>
  );
};

export default ChatHeader;