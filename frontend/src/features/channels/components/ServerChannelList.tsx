import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { ChannelItem } from './ChannelItem';
import { UserStatusFooter } from '../../users/components/UserStatusFooter';
import { channelApi, serverApi, categoryApi } from '../../../shared/services/api';
import { useUIStore, useAuthStore, useModalStore } from '../../../shared/stores/store';
import { Channel, ChannelType, Server, Category, ServerMember } from '../../../shared/types';
import { useServerEvents } from '../../../shared/hooks/useServerEvents';

export const ServerChannelList: React.FC = () => {
  const { currentServerId, currentChannelId, setCurrentChannel } = useUIStore();
  const { openModal } = useModalStore();
  const { user } = useAuthStore();
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

  const { data: server } = useQuery({
    queryKey: ['server', currentServerId],
    queryFn: async () => {
        if (!currentServerId) return null;
        const res = await serverApi.get(currentServerId);
        return res.data as Server;
    },
    enabled: !!currentServerId
  });

  const { data: members } = useQuery({
      queryKey: ['members', currentServerId],
      queryFn: async () => {
          if (!currentServerId) return [];
          const res = await serverApi.getMembers(currentServerId);
          return res.data as ServerMember[];
      },
      enabled: !!currentServerId
  });

  const { data: categories } = useQuery({
    queryKey: ['categories', currentServerId],
    queryFn: async () => {
        if (!currentServerId) return [];
        const res = await categoryApi.list(currentServerId);
        return res.data as Category[];
    },
    enabled: !!currentServerId
  });

  const { data: channels } = useQuery({
    queryKey: ['channels', currentServerId],
    queryFn: async () => {
      if (!currentServerId) return [];
      const res = await channelApi.list(currentServerId);
      return res.data as Channel[];
    },
    enabled: !!currentServerId,
  });

  const channelsByCategory: Record<string, Channel[]> = {};
  const noCategoryChannels: Channel[] = [];
  const myMember = members?.find(m => m.userId?._id === user?._id);
  const isOwner = myMember?.role === 'OWNER';

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
    <div className="w-60 bg-mew-darker flex flex-col flex-shrink-0 border-r border-mew-darkest">
      {/* Server Header Dropdown */}
      <div
        ref={dropdownRef}
        className={clsx(
            "h-12 shadow-sm flex items-center justify-between px-4 border-b border-mew-darkest cursor-pointer transition-colors relative select-none",
            isDropdownOpen ? "bg-[#35373C] hover:bg-[#35373C]" : "hover:bg-mew-dark"
        )}
        onClick={() => setIsDropdownOpen(!isDropdownOpen)}
      >
        <h1 className="font-bold text-white truncate max-w-[160px]">{server?.name || 'Server'}</h1>
        <Icon icon={isDropdownOpen ? "mdi:close" : "mdi:chevron-down"} className="text-mew-text" />

        {/* Dropdown Menu */}
        {isDropdownOpen && (
            <div className="absolute top-[52px] left-2.5 w-[220px] bg-[#111214] p-1.5 rounded-[4px] shadow-2xl z-50 animate-fade-in-up origin-top-left">
                <div
                    className="flex items-center justify-between px-2 py-2 hover:bg-mew-accent rounded-[2px] cursor-pointer text-mew-accent hover:text-white group mb-1"
                    onClick={() => openModal('createInvite')}
                >
                    <span className="text-sm font-medium">Invite People</span>
                    <Icon icon="mdi:account-plus" />
                </div>

                {isOwner && (
                    <>
                        <div className="h-[1px] bg-mew-divider my-1 mx-1"></div>
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

                         <div className="h-[1px] bg-mew-divider my-1 mx-1"></div>

                         <div
                            className="flex items-center justify-between px-2 py-2 hover:bg-mew-accent rounded-[2px] cursor-pointer text-[#949BA4] hover:text-white group"
                            onClick={() => openModal('serverSettings', { server })}
                        >
                            <span className="text-sm font-medium">Server Settings</span>
                            <Icon icon="mdi:cog-outline" />
                        </div>
                    </>
                )}

                {!isOwner && (
                    <>
                        <div className="h-[1px] bg-mew-divider my-1 mx-1"></div>
                        <div
                            className="flex items-center justify-between px-2 py-2 hover:bg-red-500 rounded-[2px] cursor-pointer text-red-400 hover:text-white group"
                            onClick={() => openModal('leaveServer', { serverId: currentServerId })}
                        >
                            <span className="text-sm font-medium">Leave Server</span>
                            <Icon icon="mdi:exit-to-app" />
                        </div>
                    </>
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
                onSettingsClick={isOwner ? (e) => { e.stopPropagation(); openModal('channelSettings', { channel }); } : undefined}
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
                            className={clsx("mr-0.5 transition-transform duration-200", collapsedCategories[category._id] && "-rotate-90")}
                        />
                        {category.name}
                    </div>

                     <div className="flex items-center space-x-1">
                        {isOwner && (
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
                        onSettingsClick={isOwner ? (e) => { e.stopPropagation(); openModal('channelSettings', { channel }); } : undefined}
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
                {isOwner && (
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