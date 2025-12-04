import React, { useState, useEffect } from 'react';
import { useModalStore, useUIStore } from '../../../shared/stores/store';
import { channelApi, categoryApi } from '../../../shared/services/api';
import { Category } from '../../../shared/types';
import { WebhookManager } from './WebhookManager';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import clsx from 'clsx';

export const ChannelSettingsModal: React.FC = () => {
  const { closeModal, modalData, openModal } = useModalStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'integrations'>('overview');

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
         <div className="flex-1 bg-[#313338] pt-[60px] px-10 max-w-[740px] overflow-y-auto">
             {activeTab === 'overview' ? (
                 <>
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
                 </>
             ) : (
                 <WebhookManager serverId={currentServerId!} channel={modalData.channel} />
             )}
         </div>
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