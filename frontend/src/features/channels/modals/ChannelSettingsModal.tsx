import React, { useState, useEffect } from 'react';
import { useModalStore, useUIStore } from '../../../shared/stores/store';
import { channelApi, categoryApi } from '../../../shared/services/api';
import { Category } from '../../../shared/types';
import { WebhookManager } from './WebhookManager';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import clsx from 'clsx';

// Permission groups for channel settings
const CHANNEL_PERMS = [
    { group: 'General', perms: [
        { id: 'VIEW_CHANNEL', name: 'View Channel' },
        { id: 'MANAGE_CHANNEL', name: 'Manage Channel' },
    ]},
    { group: 'Text', perms: [
        { id: 'SEND_MESSAGES', name: 'Send Messages' },
        { id: 'EMBED_LINKS', name: 'Embed Links' },
        { id: 'ATTACH_FILES', name: 'Attach Files' },
        { id: 'ADD_REACTIONS', name: 'Add Reactions' },
        { id: 'READ_MESSAGE_HISTORY', name: 'Read Message History' },
    ]},
];

type PermissionState = 'allow' | 'deny' | 'inherit';

interface OverrideMock {
    id: string;
    type: 'role' | 'member';
    name: string;
    color?: string;
    avatarUrl?: string;
    perms: Record<string, PermissionState>;
}

export const ChannelSettingsModal: React.FC = () => {
  const { closeModal, modalData, openModal } = useModalStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'permissions' | 'integrations'>('overview');

  // Permissions State (Mock)
  const [overrides, setOverrides] = useState<OverrideMock[]>([
      { id: 'everyone', type: 'role', name: '@everyone', perms: {} }
  ]);
  const [selectedOverrideId, setSelectedOverrideId] = useState<string>('everyone');

  useEffect(() => {
    if (modalData?.channel) {
      setName(modalData.channel.name || '');
      setCategoryId(modalData.channel.categoryId || '');
    }
  }, [modalData]);

  const { data: categories } = useQuery({
    queryKey: ['categories', currentServerId],
    queryFn: async () => {
        if (!currentServerId) return [];
        const res = await categoryApi.list(currentServerId);
        return res.data as Category[];
    },
    enabled: !!currentServerId
  });

  const handleChannelUpdate = async () => {
      if (!currentServerId || !modalData?.channel) return;
      setIsLoading(true);
      try {
          const catId = categoryId === '' ? null : categoryId;
          await channelApi.update(currentServerId, modalData.channel._id, {
              name,
              categoryId: catId
          });
          queryClient.invalidateQueries({ queryKey: ['channels', currentServerId] });
          closeModal();
      } catch (error) {
          console.error(error);
      } finally {
          setIsLoading(false);
      }
  };

  const handleAddOverride = () => {
      // Mock adding a Role override
      const newId = `role-${Date.now()}`;
      const newOverride: OverrideMock = { 
          id: newId, 
          type: 'role', 
          name: 'New Role', 
          perms: {}, 
          color: '#E74C3C' 
      };
      setOverrides(prev => [...prev, newOverride]);
      setSelectedOverrideId(newId);
  };

  const updatePermission = (permId: string, state: PermissionState) => {
      setOverrides(prev => prev.map(o => {
          if (o.id !== selectedOverrideId) return o;
          const newPerms = { ...o.perms };
          if (state === 'inherit') {
              delete newPerms[permId];
          } else {
              newPerms[permId] = state;
          }
          return { ...o, perms: newPerms };
      }));
  };

  const currentOverride = overrides.find(o => o.id === selectedOverrideId);

  return (
    <div className="fixed inset-0 z-50 flex bg-[#313338] animate-fade-in text-mew-text font-sans">
         <div className="w-[30%] min-w-[220px] bg-[#2B2D31] flex flex-col items-end pt-[60px] pb-4 px-2">
             <div className="w-[192px] px-1.5">
                <h2 className="text-xs font-bold text-mew-textMuted uppercase mb-3 px-2.5 text-ellipsis overflow-hidden whitespace-nowrap">
                    {modalData?.channel?.name || 'CHANNEL'} TEXT CHANNELS
                </h2>
                <div
                    className={clsx(
                        "px-2.5 py-1.5 rounded-[4px] font-medium text-sm cursor-pointer mb-0.5",
                        activeTab === 'overview' ? "bg-[#404249] text-white" : "text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text"
                    )}
                    onClick={() => setActiveTab('overview')}
                >
                    Overview
                </div>
                <div
                    className={clsx(
                        "px-2.5 py-1.5 rounded-[4px] font-medium text-sm cursor-pointer mb-0.5",
                        activeTab === 'permissions' ? "bg-[#404249] text-white" : "text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text"
                    )}
                    onClick={() => setActiveTab('permissions')}
                >
                    Permissions
                </div>
                <div
                    className={clsx(
                        "px-2.5 py-1.5 rounded-[4px] font-medium text-sm cursor-pointer mb-0.5",
                        activeTab === 'integrations' ? "bg-[#404249] text-white" : "text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text"
                    )}
                    onClick={() => setActiveTab('integrations')}
                >
                    Integrations
                </div>

                <div className="h-[1px] bg-mew-divider my-2 mx-2 opacity-50"></div>

                <div
                    className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text font-medium text-sm cursor-pointer mb-0.5 flex justify-between group"
                    onClick={() => openModal('deleteChannel', modalData)}
                >
                    <span className="text-red-400">Delete Channel</span>
                    <Icon icon="mdi:trash-can-outline" className="hidden group-hover:block text-red-400" />
                </div>
             </div>
         </div>
         <div className="flex-1 bg-[#313338] pt-[60px] px-10 max-w-[800px] overflow-hidden flex flex-col h-full">
             
             {/* OVERVIEW */}
             {activeTab === 'overview' && (
                 <div className="animate-fade-in overflow-y-auto custom-scrollbar h-full pb-10">
                    <h2 className="text-xl font-bold text-white mb-6">Overview</h2>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Channel Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium"
                            />
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Category</label>
                            <select
                                value={categoryId}
                                onChange={(e) => setCategoryId(e.target.value)}
                                className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium appearance-none"
                            >
                                <option value="">No Category</option>
                                {categories?.map((cat) => (
                                    <option key={cat._id} value={cat._id}>{cat.name}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Channel Topic</label>
                            <textarea
                                className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium h-20 resize-none"
                                placeholder="Let everyone know how to use this channel!"
                            />
                        </div>
                        <div className="flex gap-4 pt-4">
                            <button
                                onClick={handleChannelUpdate}
                                disabled={isLoading}
                                className="bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2 rounded-[3px] font-medium text-sm transition-colors"
                            >
                                Save Changes
                            </button>
                            <button onClick={closeModal} className="text-white hover:underline text-sm font-medium px-2 self-center">Cancel</button>
                        </div>
                    </div>
                 </div>
             )}

             {/* PERMISSIONS */}
             {activeTab === 'permissions' && (
                 <div className="flex h-full animate-fade-in overflow-hidden">
                     {/* Override List */}
                     <div className="w-[220px] flex-shrink-0 flex flex-col pr-4 border-r border-[#3F4147] h-full pb-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-xs font-bold text-mew-textMuted uppercase">Roles / Members</h3>
                            <button onClick={handleAddOverride} className="text-mew-textMuted hover:text-white">
                                <Icon icon="mdi:plus" width="18" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto custom-scrollbar space-y-0.5">
                            {overrides.map(override => (
                                <div 
                                    key={override.id}
                                    className={clsx(
                                        "flex items-center px-2 py-1.5 rounded cursor-pointer mb-1",
                                        selectedOverrideId === override.id ? "bg-[#404249] text-white" : "text-[#B5BAC1] hover:bg-[#35373C]"
                                    )}
                                    onClick={() => setSelectedOverrideId(override.id)}
                                >
                                    {override.type === 'role' ? (
                                        <div className="w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: override.color || '#99AAB5' }}></div>
                                    ) : (
                                        <div className="w-5 h-5 rounded-full bg-gray-600 mr-2 flex-shrink-0 overflow-hidden">
                                            {override.avatarUrl && <img src={override.avatarUrl} className="w-full h-full object-cover"/>}
                                        </div>
                                    )}
                                    <span className="text-sm font-medium truncate flex-1">{override.name}</span>
                                </div>
                            ))}
                        </div>
                     </div>

                     {/* Permissions Editor */}
                     <div className="flex-1 pl-6 flex flex-col overflow-y-auto custom-scrollbar pb-10">
                         <div className="mb-6">
                            <h2 className="text-lg font-bold text-white mb-1">Advanced Permissions</h2>
                            <p className="text-sm text-mew-textMuted">
                                Override permissions for <strong className="text-white">{currentOverride?.name}</strong> in this specific channel.
                            </p>
                         </div>

                         {CHANNEL_PERMS.map(group => (
                             <div key={group.group} className="mb-6">
                                 <h3 className="text-xs font-bold text-mew-textMuted uppercase mb-2 border-b border-[#3F4147] pb-1">{group.group} Permissions</h3>
                                 <div className="space-y-0.5">
                                     {group.perms.map(perm => {
                                         const state = currentOverride?.perms[perm.id] || 'inherit';
                                         return (
                                             <div key={perm.id} className="flex items-center justify-between py-2 border-b border-[#3F4147]/30">
                                                 <span className="text-sm font-medium text-[#DBDEE1]">{perm.name}</span>
                                                 <div className="flex items-center space-x-1">
                                                     {/* Deny */}
                                                     <div 
                                                        className={clsx(
                                                            "w-8 h-8 flex items-center justify-center rounded cursor-pointer border",
                                                            state === 'deny' ? "bg-red-500 border-red-500 text-white" : "border-[#4E5058] text-[#B5BAC1] hover:border-red-500"
                                                        )}
                                                        onClick={() => updatePermission(perm.id, 'deny')}
                                                        title="Deny"
                                                     >
                                                         <Icon icon="mdi:close" width="20" />
                                                     </div>
                                                     {/* Inherit */}
                                                     <div 
                                                        className={clsx(
                                                            "w-8 h-8 flex items-center justify-center rounded cursor-pointer border",
                                                            state === 'inherit' ? "bg-[#4E5058] border-[#4E5058] text-white" : "border-[#4E5058] text-[#B5BAC1]"
                                                        )}
                                                        onClick={() => updatePermission(perm.id, 'inherit')}
                                                        title="Inherit"
                                                     >
                                                         <span className="text-lg font-bold">/</span>
                                                     </div>
                                                     {/* Allow */}
                                                     <div 
                                                        className={clsx(
                                                            "w-8 h-8 flex items-center justify-center rounded cursor-pointer border",
                                                            state === 'allow' ? "bg-green-500 border-green-500 text-white" : "border-[#4E5058] text-[#B5BAC1] hover:border-green-500"
                                                        )}
                                                        onClick={() => updatePermission(perm.id, 'allow')}
                                                        title="Allow"
                                                     >
                                                         <Icon icon="mdi:check" width="20" />
                                                     </div>
                                                 </div>
                                             </div>
                                         )
                                     })}
                                 </div>
                             </div>
                         ))}
                     </div>
                 </div>
             )}

             {/* INTEGRATIONS */}
             {activeTab === 'integrations' && (
                 <div className="animate-fade-in overflow-y-auto custom-scrollbar h-full">
                    <WebhookManager serverId={currentServerId!} channel={modalData.channel} />
                 </div>
             )}
         </div>

         {/* Close */}
         <div className="w-[18%] min-w-[60px] pt-[60px] pl-5">
             <div className="flex flex-col items-center cursor-pointer group" onClick={closeModal}>
                 <div className="w-9 h-9 rounded-full border-[2px] border-mew-textMuted group-hover:bg-mew-textMuted/20 flex items-center justify-center transition-colors mb-1">
                     <Icon icon="mdi:close" className="text-mew-textMuted group-hover:text-white" width="24" height="24" />
                 </div>
                 <span className="text-xs font-bold text-mew-textMuted group-hover:text-white transition-colors">ESC</span>
             </div>
         </div>
    </div>
  );
};