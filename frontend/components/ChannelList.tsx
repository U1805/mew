
import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { channelApi, serverApi, categoryApi } from '../services/api';
import { useUIStore, useAuthStore, useModalStore } from '../store';
import { Channel, ChannelType, Server, Category } from '../types';
import { Icon } from '@iconify/react';
import clsx from 'clsx';

const ChannelList: React.FC = () => {
  const { currentServerId, currentChannelId, setCurrentChannel, openSettings } = useUIStore();
  const { openModal } = useModalStore();
  const { user } = useAuthStore();
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({});
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const toggleCategory = (categoryId: string) => {
    setCollapsedCategories(prev => ({ ...prev, [categoryId]: !prev[categoryId] }));
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- Queries for Server View ---
  const { data: server } = useQuery({
    queryKey: ['server', currentServerId],
    queryFn: async () => {
        if (!currentServerId) return null;
        const res = await serverApi.get(currentServerId);
        return res.data as Server;
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

  // --- Queries for DM View ---
  const { data: dmChannels } = useQuery({
      queryKey: ['dmChannels'],
      queryFn: async () => {
          try {
             const res = await channelApi.listDMs(); 
             return (res.data as Channel[]).filter(c => c.type === ChannelType.DM);
          } catch (e) {
              return [];
          }
      },
      enabled: !currentServerId // Only fetch when in Home view
  });


  // --- Render DM View ---
  if (!currentServerId) {
    return (
      <div className="w-60 bg-mew-darker flex flex-col border-r border-mew-darkest flex-shrink-0">
        <div className="h-12 shadow-sm flex items-center px-2 border-b border-mew-darkest">
             <button className="w-full text-left px-2 py-1 rounded bg-mew-darkest text-mew-textMuted text-sm hover:bg-[#1E1F22] transition-colors">
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
                <Icon icon="mdi:plus" className="text-mew-textMuted hover:text-mew-text cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
            
            {dmChannels?.map(dm => {
                 const otherUser = dm.recipients?.find(r => typeof r === 'object' && r._id !== user?._id) as any;
                 const name = otherUser?.username || dm.name || 'Unknown User';
                 
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
                            {/* Fake online status for demo */}
                            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-[2.5px] border-[#2B2D31]"></div>
                        </div>
                        <span className="font-medium truncate flex-1">{name}</span>
                        <div className="opacity-0 group-hover:opacity-100 cursor-pointer text-mew-textMuted hover:text-white" title="Remove DM">
                           <Icon icon="mdi:close" width="16" />
                        </div>
                    </div>
                 )
            })}
        </div>
        
        <UserStatusFooter user={user} openSettings={openSettings} />
      </div>
    );
  }

  // --- Render Server View ---

  const channelsByCategory: Record<string, Channel[]> = {};
  const noCategoryChannels: Channel[] = [];

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
                    className="flex items-center justify-between px-2 py-2 hover:bg-mew-accent rounded-[2px] cursor-pointer text-[#949BA4] hover:text-white group mb-1"
                    onClick={() => console.log('Server Boost')}
                >
                    <span className="text-sm font-medium">Server Boost</span>
                    <Icon icon="mdi:star-four-points" className="text-[#F47FFF] group-hover:text-white" />
                </div>
                
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

                <div className="h-[1px] bg-mew-divider my-1 mx-1"></div>

                 <div 
                    className="flex items-center justify-between px-2 py-2 hover:bg-red-500 rounded-[2px] cursor-pointer text-red-400 hover:text-white group"
                >
                    <span className="text-sm font-medium">Leave Server</span>
                    <Icon icon="mdi:exit-to-app" />
                </div>
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
                    <div 
                        className="opacity-0 group-hover:opacity-100 cursor-pointer hover:text-white transition-opacity" 
                        title="Create Channel"
                        onClick={(e) => { 
                            e.stopPropagation(); 
                            openModal('createChannel', { categoryId: category._id, categoryName: category.name }); 
                        }} 
                    >
                        <Icon icon="mdi:plus" />
                    </div>
                </div>

                {!collapsedCategories[category._id] && channelsByCategory[category._id]?.map(channel => (
                     <ChannelItem 
                        key={channel._id} 
                        channel={channel} 
                        isActive={currentChannelId === channel._id} 
                        onClick={() => setCurrentChannel(channel._id)} 
                        onSettingsClick={(e) => { e.stopPropagation(); openModal('channelSettings', { channel }); }}
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
                <button 
                    className="mt-2 text-mew-accent hover:underline text-xs font-medium"
                    onClick={() => openModal('createChannel')}
                >
                    Create a channel
                </button>
            </div>
        )}
      </div>
      
      <UserStatusFooter user={user} openSettings={openSettings} />
    </div>
  );
};

// Sub-components
const ChannelItem = ({ channel, isActive, onClick, onSettingsClick }: { channel: Channel, isActive: boolean, onClick: () => void, onSettingsClick: (e: any) => void }) => (
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

const UserStatusFooter = ({ user, openSettings }: { user: any, openSettings: () => void }) => (
    <div className="h-[52px] bg-[#232428] flex items-center px-2 flex-shrink-0 z-10">
        <div className="w-8 h-8 rounded-full bg-mew-accent flex items-center justify-center mr-2 overflow-hidden hover:opacity-80 cursor-pointer group">
            {user?.avatarUrl ? (
                 <img src={user.avatarUrl} alt="Me" className="w-full h-full object-cover" />
            ) : (
                <Icon icon="mdi:user" className="text-white" />
            )}
        </div>
        <div className="flex-1 min-w-0 mr-2 group cursor-pointer" onClick={() => { /* Perhaps copy ID */ }}>
            <div className="text-sm font-semibold text-white truncate">{user?.username || 'Guest'}</div>
            <div className="text-xs text-mew-textMuted truncate group-hover:text-mew-text">#{user?._id?.substring(0, 4) || '0000'}</div>
        </div>
        <div className="flex items-center">
            <button className="text-mew-textMuted hover:text-white p-1.5 rounded hover:bg-mew-dark transition-colors" title="Mute">
                <Icon icon="mdi:microphone" width="20" />
            </button>
            <button className="text-mew-textMuted hover:text-white p-1.5 rounded hover:bg-mew-dark transition-colors" title="Deafen">
                <Icon icon="mdi:headphones" width="20" />
            </button>
            <button 
                className="text-mew-textMuted hover:text-white p-1.5 rounded hover:bg-mew-dark transition-colors" 
                title="User Settings"
                onClick={openSettings}
            >
                <Icon icon="mdi:cog" width="20" />
            </button>
        </div>
    </div>
);

export default ChannelList;
