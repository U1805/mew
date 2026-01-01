import React, { useState, useEffect, useRef } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { ChannelItem } from './ChannelItem';
import { UserStatusFooter } from '../../users/components/UserStatusFooter';
import { useUIStore, useModalStore } from '../../../shared/stores';
import { Channel, ChannelType } from '../../../shared/types';
import { useServerEvents } from '../../../shared/hooks/useServerEvents';
import { useServerPermissions } from '../../../shared/hooks/useServerPermissions';
import { useServer } from '../../servers/hooks/useServer';
import { useCategories } from '../hooks/useCategories';
import { useServerChannels } from '../hooks/useServerChannels';

export const ServerChannelList: React.FC = () => {
  const { currentServerId, currentChannelId, setCurrentChannel } = useUIStore();
  const { openModal } = useModalStore();
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useServerEvents(currentServerId);

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories(prev => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { data: server } = useServer(currentServerId);
  const { data: categories } = useCategories(currentServerId);
  const { data: channels } = useServerChannels(currentServerId);

  const channelsByCategory: Record<string, Channel[]> = {};
  const noCategoryChannels: Channel[] = [];
  const { permissions: serverPermissions, isOwner } = useServerPermissions();

  const canCreateInvite = serverPermissions.has('CREATE_INSTANT_INVITE') || serverPermissions.has('ADMINISTRATOR');
  const canManageChannels = serverPermissions.has('MANAGE_CHANNEL') || serverPermissions.has('ADMINISTRATOR');
  const canManageServer = serverPermissions.has('MANAGE_SERVER') || serverPermissions.has('ADMINISTRATOR');

  channels?.forEach(channel => {
      if (channel.type !== ChannelType.GUILD_TEXT) return;
      if (channel.categoryId) {
          if (!channelsByCategory[channel.categoryId]) {
              channelsByCategory[channel.categoryId] = [];
          }
          channelsByCategory[channel.categoryId].push(channel);
      } else {
          noCategoryChannels.push(channel);
      }
  });

  return (
    <div className="w-full h-full bg-mew-darker flex flex-col flex-shrink-0 border-r border-mew-darkest">
      {/* Server Header Dropdown */}
      <div
        ref={dropdownRef}
        className={clsx(
            "h-12 shadow-sm flex items-center justify-between px-4 border-b border-mew-darkest cursor-pointer transition-colors relative select-none shrink-0",
            isDropdownOpen ? "bg-[#35373C] hover:bg-[#35373C]" : "hover:bg-mew-dark"
        )}
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
      >
        <h1 className="font-bold text-white truncate max-w-[160px]">{server?.name || 'Server'}</h1>
        <Icon icon={isDropdownOpen ? "mdi:close" : "mdi:chevron-down"} className="text-mew-text" />

        {/* Dropdown Menu */}
        {isDropdownOpen && (
            <div className="absolute top-[52px] left-2.5 w-[220px] bg-[#111214] p-1.5 rounded-[4px] shadow-2xl z-50 animate-fade-in-up origin-top-left">
                {canCreateInvite && (
                    <div
                        className="flex items-center justify-between px-2 py-2 hover:bg-mew-accent rounded-[2px] cursor-pointer text-mew-accent hover:text-white group mb-1"
                        onClick={() => openModal('createInvite')}
                    >
                        <span className="text-sm font-medium">Invite People</span>
                        <Icon icon="mdi:account-plus" />
                    </div>
                )}

                <div
                    className="flex items-center justify-between px-2 py-2 hover:bg-mew-accent rounded-[2px] cursor-pointer text-[#949BA4] hover:text-white group mb-1"
                    onClick={() => openModal('serverNotifications', { server, serverId: currentServerId })}
                >
                    <span className="text-sm font-medium">Notification Settings</span>
                    <Icon icon="mdi:bell-outline" />
                </div>

                {isOwner && (
                    <div
                        className="flex items-center justify-between px-2 py-2 hover:bg-mew-accent rounded-[2px] cursor-pointer text-[#949BA4] hover:text-white group mb-1"
                        onClick={() => openModal('inviteBot')}
                    >
                        <span className="text-sm font-medium">Add App</span>
                        <Icon icon="mdi:robot" />
                    </div>
                )}

                {(canManageChannels || canManageServer) && <div className="h-[1px] bg-mew-divider my-1 mx-1"></div>}

                {canManageChannels && (
                    <>
                        <div
                            className="flex items-center justify-between px-2 py-2 hover:bg-mew-accent rounded-[2px] cursor-pointer text-[#949BA4] hover:text-white group"
                            onClick={() => openModal('createCategory')}
                        >
                            <span className="text-sm font-medium">Create Category</span>
                            <Icon icon="mdi:folder-plus-outline" />
                        </div>
                        <div
                            className="flex items-center justify-between px-2 py-2 hover:bg-mew-accent rounded-[2px] cursor-pointer text-[#949BA4] hover:text-white group"
                            onClick={() => openModal('createChannel')}
                        >
                            <span className="text-sm font-medium">Create Channel</span>
                            <Icon icon="mdi:plus-circle-outline" />
                        </div>
                    </>
                )}

                {canManageServer && (
                     <div
                        className="flex items-center justify-between px-2 py-2 hover:bg-mew-accent rounded-[2px] cursor-pointer text-[#949BA4] hover:text-white group"
                        onClick={() => openModal('serverSettings', { server })}
                    >
                        <span className="text-sm font-medium">Server Settings</span>
                        <Icon icon="mdi:cog-outline" />
                    </div>
                )}

                {(canManageChannels || canManageServer) && <div className="h-[1px] bg-mew-divider my-1 mx-1"></div>}

                {!isOwner && (
                    <div
                        className="flex items-center justify-between px-2 py-2 hover:bg-red-500 rounded-[2px] cursor-pointer text-red-400 hover:text-white group"
                        onClick={() => openModal('leaveServer', { serverId: currentServerId })}
                    >
                        <span className="text-sm font-medium">Leave Server</span>
                        <Icon icon="mdi:exit-to-app" />
                    </div>
                )}
            </div>
        )}
      </div>

      {/* Channels List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5 custom-scrollbar">

        {/* No Category Channels */}
        {noCategoryChannels.map(channel => (
            <ChannelItem
                key={channel._id}
                channel={channel}
                isActive={currentChannelId === channel._id}
                onClick={() => setCurrentChannel(channel._id)}
                onSettingsClick={(e) => { e.stopPropagation(); openModal('channelSettings', { channel }); }}
                onNotificationClick={(e) => { e.stopPropagation(); openModal('channelNotifications', { channel }); }}
            />
        ))}

        {/* Categories */}
        {categories?.map(category => (
            <div key={category._id} className="mt-4">
                <div
                    className="flex items-center justify-between px-0.5 mb-1 cursor-pointer hover:text-mew-text text-mew-textMuted group select-none"
                    onClick={() => toggleCategory(category._id)}
                >
                    <div className="flex items-center text-xs font-bold uppercase tracking-wide transition-colors group-hover:text-mew-text">
                        <Icon
                            icon="mdi:chevron-down"
                            width="12"
                            className={clsx(
                                "mr-0.5 transition-transform duration-200 ease-ios", // Use silky ease
                                collapsedCategories[category._id] ? "-rotate-90" : "rotate-0"
                            )}
                        />
                        {category.name}
                    </div>

                     <div className="flex items-center space-x-1">
                        {canManageChannels && (
                            <>
                                <div
                                    className="opacity-0 group-hover:opacity-100 cursor-pointer hover:text-white transition-opacity"
                                    title="Create Channel"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openModal('createChannel', { categoryId: category._id, categoryName: category.name });
                                    }}
                                >
                                    <Icon icon="mdi:plus" width="18" />
                                </div>
                                <div
                                    className="opacity-0 group-hover:opacity-100 cursor-pointer hover:text-white transition-opacity"
                                    title="Edit Category"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        openModal('editCategory', { category });
                                    }}
                                >
                                    <Icon icon="mdi:cog" width="14" />
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {!collapsedCategories[category._id] && channelsByCategory[category._id]?.map(channel => (
                     <ChannelItem
                        key={channel._id}
                        channel={channel}
                        isActive={currentChannelId === channel._id}
                        onClick={() => setCurrentChannel(channel._id)}
                        onSettingsClick={(e) => { e.stopPropagation(); openModal('channelSettings', { channel }); }}
                        onNotificationClick={(e) => { e.stopPropagation(); openModal('channelNotifications', { channel }); }}
                    />
                ))}
            </div>
        ))}

        {(!channels || channels.length === 0) && (
            <div className="flex flex-col items-center justify-center h-40 text-center opacity-75">
                <div className="border border-dashed border-mew-textMuted rounded-full p-3 mb-2">
                    <Icon icon="mdi:chat-plus-outline" className="text-mew-textMuted" width="24" />
                </div>
                <p className="text-mew-textMuted text-xs px-4">Nothing here yet.</p>
                {canManageChannels && (
                    <button
                        className="mt-2 text-mew-accent hover:underline text-xs font-medium"
                        onClick={() => openModal('createChannel')}
                    >
                        Create a channel
                    </button>
                )}
            </div>
        )}
      </div>

      <UserStatusFooter />
    </div>
  );
};
