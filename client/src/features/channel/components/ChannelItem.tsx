import React from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { Channel, ChannelType } from '../../../shared/types';
import { useUnreadStore } from '../../../shared/stores';
import { usePermissions } from '../../../shared/hooks/usePermissions';
import { useI18n } from '../../../shared/i18n';

interface ChannelItemProps {
    channel: Channel;
    isActive: boolean;
    onClick: () => void;
    onSettingsClick?: (e: React.MouseEvent) => void;
    onNotificationClick?: (e: React.MouseEvent) => void;
}

export const ChannelItem: React.FC<ChannelItemProps> = ({ channel, isActive, onClick, onSettingsClick, onNotificationClick }) => {
    const { t } = useI18n();
    const permissions = usePermissions(channel._id);
    const canManageChannel = permissions.has('MANAGE_CHANNEL');
    const unreadChannelIds = useUnreadStore(state => state.unreadChannelIds);
    const hasUnread = unreadChannelIds.has(channel._id);

    const channelIcon =
      channel.type === ChannelType.GUILD_WEB
        ? 'mdi:web'
        : channel.type === ChannelType.DM
          ? 'mdi:at'
          : 'mdi:pound';

    return (
        <div
            onClick={onClick}
            className={clsx(
                "group flex items-center justify-between px-2 py-[5px] rounded mx-1 cursor-pointer transition-colors relative",
                isActive 
                    ? "bg-mew-dark text-white" 
                    : hasUnread 
                        ? "text-white hover:bg-[#35373C]" 
                        : "text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text"
            )}
        >
            <div className="flex items-center min-w-0 overflow-hidden flex-1 mr-1">
                <Icon icon={channelIcon} width="24" height="24" className={clsx("mr-1.5 flex-shrink-0", hasUnread ? "text-white" : "text-[#80848E]")} />
                <span className="text-base truncate font-normal">{channel.name}</span>
                {/* Unread Indicator - Right side of name */}
                {hasUnread && !isActive && (
                    <div className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0 ml-2"></div>
                )}
            </div>

            <div className="flex items-center gap-1 flex-shrink-0">
                {onNotificationClick && (
                    <div
                        className="opacity-0 group-hover:opacity-100 cursor-pointer text-mew-textMuted hover:text-white transition-opacity"
                        title={t('server.menu.notificationSettings')}
                        onClick={onNotificationClick}
                    >
                        <Icon icon="mdi:bell-outline" width="18" height="18" />
                    </div>
                )}

                {/* Settings Icon - Shows on hover or if active */}
                {canManageChannel && onSettingsClick && (
                    <div
                        className="opacity-0 group-hover:opacity-100 cursor-pointer text-mew-textMuted hover:text-white transition-opacity"
                        title={t('common.edit')}
                        onClick={onSettingsClick}
                    >
                        <Icon icon="mdi:cog" width="18" height="18" />
                    </div>
                )}
            </div>
        </div>
    );
};
