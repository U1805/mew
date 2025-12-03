import React from 'react';
import { Channel } from '@/shared/types';
import { Icon } from '@iconify/react';
import clsx from 'clsx';

interface ChannelItemProps {
    channel: Channel;
    isActive: boolean;
    onClick: () => void;
    onSettingsClick: (e: React.MouseEvent) => void;
}

export const ChannelItem: React.FC<ChannelItemProps> = ({ channel, isActive, onClick, onSettingsClick }) => (
    <div
        onClick={onClick}
        className={clsx(
            "group flex items-center justify-between px-2 py-[6px] rounded mx-1 cursor-pointer transition-colors relative",
            isActive ? "bg-mew-dark text-white" : "text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text"
        )}
    >
        <div className="flex items-center min-w-0 overflow-hidden">
            <Icon icon="mdi:pound" width="20" height="20" className="mr-1.5 flex-shrink-0 text-[#80848E]" />
            <span className="text-sm font-medium truncate flex-1 min-w-0">{channel.name}</span>
        </div>

        {/* Settings Icon - Shows on hover or if active */}
        <div
            className="opacity-0 group-hover:opacity-100 cursor-pointer text-mew-textMuted hover:text-white ml-2 flex-shrink-0 transition-opacity"
            title="Edit Channel"
            onClick={onSettingsClick}
        >
            <Icon icon="mdi:cog" width="16" height="16" />
        </div>
    </div>
);