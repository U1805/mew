import React from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { Channel } from '../../../shared/types';
import { useUnreadStore } from '../../../shared/stores/store';

interface ChannelItemProps {
    channel: Channel;
    isActive: boolean;
    onClick: () => void;
    onSettingsClick?: (e: React.MouseEvent) => void;
}

export const ChannelItem: React.FC<ChannelItemProps> = ({ channel, isActive, onClick, onSettingsClick }) => {
    const unreadChannelIds = useUnreadStore(state => state.unreadChannelIds);
    const hasUnread = unreadChannelIds.has(channel._id);

    return (
        <div
            onClick={onClick}
            className={clsx(
                "group flex items-center justify-between px-2 py-[6px] rounded mx-1 cursor-pointer transition-colors relative",
                isActive 
                    ? "bg-mew-dark text-white" 
                    : hasUnread 
                        ? "text-white hover:bg-[#35373C]" 
                        : "text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text"
            )}
        >
            <div className="flex items-center min-w-0 overflow-hidden flex-1 mr-1">
                <Icon icon="mdi:pound" width="20" height="20" className={clsx("mr-1.5 flex-shrink-0", hasUnread ? "text-white" : "text-[#80848E]")} />
                <span className={clsx("text-sm truncate", hasUnread ? "font-bold" : "font-medium")}>{channel.name}</span>
                {/* Unread Indicator - Right side of name */}
                {hasUnread && !isActive && (
                    <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 ml-2"></div>
                )}
            </div>

            {/* Settings Icon - Shows on hover or if active */}
            {onSettingsClick && (
                <div
                    className="opacity-0 group-hover:opacity-100 cursor-pointer text-mew-textMuted hover:text-white ml-1 flex-shrink-0 transition-opacity"
                    title="Edit Channel"
                    onClick={onSettingsClick}
                >
                    <Icon icon="mdi:cog" width="16" height="16" />
                </div>
            )}
        </div>
    );
};