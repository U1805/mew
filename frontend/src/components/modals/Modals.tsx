
import React, { useState, useEffect } from 'react';
import { useModalStore, useUIStore } from '../../store';
import { serverApi, channelApi, categoryApi, messageApi } from '../../services/api';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { format } from 'date-fns';

const Modal: React.FC = () => {
  const { activeModal, closeModal, modalData } = useModalStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();
  
  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Initialize state based on modal type and data
  useEffect(() => {
      if (!activeModal) {
          setName('');
          setIsLoading(false);
          return;
      }

      if (activeModal === 'channelSettings' && modalData?.channel) {
          setName(modalData.channel.name || '');
      } else if (activeModal === 'serverSettings' && modalData?.server) {
          setName(modalData.server.name || '');
      } else {
          setName('');
      }
  }, [activeModal, modalData]);

  if (!activeModal) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Allow submit if it's a delete action (name not required)
    if (!name.trim() && activeModal !== 'deleteChannel' && activeModal !== 'deleteMessage') return;

    setIsLoading(true);
    try {
      if (activeModal === 'createServer') {
        await serverApi.create({ name });
        queryClient.invalidateQueries({ queryKey: ['servers'] });
      } else if (activeModal === 'createCategory' && currentServerId) {
        await categoryApi.create(currentServerId, { name });
        queryClient.invalidateQueries({ queryKey: ['categories', currentServerId] });
      } else if (activeModal === 'createChannel' && currentServerId) {
        await channelApi.create(currentServerId, { 
            name, 
            type: 'GUILD_TEXT',
            categoryId: modalData?.categoryId 
        });
        queryClient.invalidateQueries({ queryKey: ['channels', currentServerId] });
      } else if (activeModal === 'deleteChannel' && currentServerId) {
         // Fake delete for now as API might not be fully implemented or we need ID from modalData
         // await channelApi.delete(currentServerId, modalData.channel._id);
         console.log("Deleting channel", modalData.channel._id);
         queryClient.setQueryData(['channels', currentServerId], (old: any[]) => old.filter(c => c._id !== modalData.channel._id));
      } else if (activeModal === 'deleteMessage' && currentServerId && modalData?.message) {
          await messageApi.delete(currentServerId, modalData.message.channelId, modalData.message._id);
          // Optimistic update
          queryClient.setQueryData(['messages', modalData.message.channelId], (old: any[]) => {
              if (!old) return old;
              return old.filter(m => m._id !== modalData.message._id);
          });
      }
      
      closeModal();
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Modal Content Logic ---
  
  if (activeModal === 'serverSettings') {
      return (
        <div className="fixed inset-0 z-50 flex bg-[#313338] animate-fade-in text-mew-text font-sans">
             <div className="w-[30%] min-w-[220px] bg-[#2B2D31] flex flex-col items-end pt-[60px] pb-4 px-2">
                 <div className="w-[192px] px-1.5">
                    <h2 className="text-xs font-bold text-mew-textMuted uppercase mb-3 px-2.5">Server Settings</h2>
                    <div className="px-2.5 py-1.5 rounded-[4px] bg-[#404249] text-white font-medium text-sm cursor-pointer mb-0.5">Overview</div>
                    <div className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text font-medium text-sm cursor-pointer mb-0.5">Roles</div>
                    <div className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text font-medium text-sm cursor-pointer mb-0.5">Emoji</div>
                    <div className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text font-medium text-sm cursor-pointer mb-0.5">Stickers</div>
                    
                    <div className="h-[1px] bg-mew-divider my-2 mx-2 opacity-50"></div>
                    
                    <div className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text font-medium text-sm cursor-pointer mb-0.5 flex justify-between group">
                        <span className="group-hover:text-red-400">Delete Server</span>
                        <Icon icon="mdi:trash-can-outline" className="hidden group-hover:block text-red-400" />
                    </div>
                 </div>
             </div>
             <div className="flex-1 bg-[#313338] pt-[60px] px-10 max-w-[740px]">
                 <h2 className="text-xl font-bold text-white mb-6">Server Overview</h2>
                 <div className="flex gap-8">
                     <div className="flex items-center justify-center">
                         <div className="w-[100px] h-[100px] rounded-full bg-mew-accent flex items-center justify-center relative group cursor-pointer">
                             <div className="text-white text-3xl font-bold">{modalData?.server?.name?.substring(0,2).toUpperCase()}</div>
                             <div className="absolute top-0 right-0 bg-white rounded-full p-1 shadow-md">
                                 <Icon icon="mdi:image-plus" className="text-black" width="16" />
                             </div>
                             <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs font-bold text-white uppercase">
                                 Change Icon
                             </div>
                         </div>
                     </div>
                     <div className="flex-1 space-y-4">
                         <div>
                            <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Server Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium"
                            />
                         </div>
                         <div className="flex gap-4">
                             <button className="bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2 rounded-[3px] font-medium text-sm transition-colors">Save Changes</button>
                             <button onClick={closeModal} className="text-white hover:underline text-sm font-medium px-2 self-center">Cancel</button>
                         </div>
                     </div>
                 </div>
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
      )
  }

  // --- Render Standard Modal (Create/Delete) ---
  
  const getTitle = () => {
      switch (activeModal) {
          case 'createServer': return 'Customize Your Server';
          case 'createCategory': return 'Create Category';
          case 'createChannel': return 'Create Channel';
          case 'channelSettings': return 'Overview'; // We'll customize this layout slightly
          case 'deleteChannel': return 'Delete Channel';
          case 'deleteMessage': return 'Delete Message';
          default: return '';
      }
  };

  const getLabel = () => {
      switch (activeModal) {
          case 'createServer': return 'Server Name';
          case 'createCategory': return 'Category Name';
          case 'createChannel': return 'Channel Name';
          case 'channelSettings': return 'Channel Name';
          default: return 'Name';
      }
  };

  // Special layout for Channel Settings (simplified version of Server Settings)
  if (activeModal === 'channelSettings') {
     return (
        <div className="fixed inset-0 z-50 flex bg-[#313338] animate-fade-in text-mew-text font-sans">
             <div className="w-[30%] min-w-[220px] bg-[#2B2D31] flex flex-col items-end pt-[60px] pb-4 px-2">
                 <div className="w-[192px] px-1.5">
                    <h2 className="text-xs font-bold text-mew-textMuted uppercase mb-3 px-2.5 text-ellipsis overflow-hidden whitespace-nowrap">
                        {modalData?.channel?.name || 'CHANNEL'} TEXT CHANNELS
                    </h2>
                    <div className="px-2.5 py-1.5 rounded-[4px] bg-[#404249] text-white font-medium text-sm cursor-pointer mb-0.5">Overview</div>
                    <div className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text font-medium text-sm cursor-pointer mb-0.5">Permissions</div>
                    <div className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text font-medium text-sm cursor-pointer mb-0.5">Invites</div>
                    
                    <div className="h-[1px] bg-mew-divider my-2 mx-2 opacity-50"></div>
                    
                    <div 
                        className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text font-medium text-sm cursor-pointer mb-0.5 flex justify-between group"
                        onClick={() => useModalStore.getState().openModal('deleteChannel', modalData)}
                    >
                        <span className="text-red-400">Delete Channel</span>
                        <Icon icon="mdi:trash-can-outline" className="hidden group-hover:block text-red-400" />
                    </div>
                 </div>
             </div>
             <div className="flex-1 bg-[#313338] pt-[60px] px-10 max-w-[740px]">
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
                        <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Channel Topic</label>
                        <textarea
                            className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium h-20 resize-none"
                            placeholder="Let everyone know how to use this channel!"
                        />
                     </div>
                     <div className="flex gap-4 pt-4">
                         <button className="bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2 rounded-[3px] font-medium text-sm transition-colors">Save Changes</button>
                         <button onClick={closeModal} className="text-white hover:underline text-sm font-medium px-2 self-center">Cancel</button>
                     </div>
                 </div>
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
  }

  // Generic Dialog Modal (Create X, Delete X)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#313338] w-full max-w-md rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in">
        
        {/* Header */}
        <div className="p-4 pt-5 pb-3">
            <h2 className="text-xl font-bold text-white mb-2">{getTitle()}</h2>
            <p className="text-mew-textMuted text-sm leading-5">
                {activeModal === 'createServer' ? "Give your new server a personality with a name and an icon. You can always change it later." : ""}
                {activeModal === 'createChannel' && modalData?.categoryName ? `in ${modalData.categoryName}` : ""}
                {activeModal === 'deleteChannel' && `Are you sure you want to delete #${modalData?.channel?.name}? This cannot be undone.`}
                {activeModal === 'deleteMessage' && "Are you sure you want to delete this message?"}
            </p>
        </div>

        {/* Form or Message Preview */}
        {activeModal === 'deleteMessage' && modalData?.message ? (
             <div className="px-4 mb-2">
                 <div className="border border-mew-divider/60 shadow-sm rounded bg-[#2B2D31] p-3 overflow-hidden">
                     <div className="flex items-start">
                          <div className="w-10 h-10 rounded-full bg-mew-accent flex items-center justify-center text-white font-semibold mr-3 flex-shrink-0 mt-0.5">
                             {modalData.author?.avatarUrl ? (
                                 <img src={modalData.author.avatarUrl} alt="Avatar" className="w-full h-full rounded-full object-cover"/>
                             ) : (
                                 modalData.author?.username?.slice(0, 2).toUpperCase() || '?'
                             )}
                          </div>
                          <div className="flex-1 min-w-0">
                              <div className="flex items-center mb-1">
                                 <span className="font-bold text-white mr-1.5">{modalData.author?.username || 'Unknown'}</span>
                                 <span className="text-xs text-mew-textMuted">{format(new Date(modalData.message.createdAt), 'MM/dd/yyyy h:mm a')}</span>
                              </div>
                              <p className="text-mew-text text-sm whitespace-pre-wrap">{modalData.message.content}</p>
                          </div>
                     </div>
                 </div>
             </div>
        ) : activeModal !== 'deleteChannel' ? (
             <form onSubmit={handleSubmit} className="px-4">
                <div className="mb-4">
                    <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">{getLabel()}</label>
                    <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium"
                        placeholder="Enter name"
                        autoFocus
                    />
                </div>
            </form>
        ) : (
             // Delete Channel Warning Visual
             <div className="px-4 pb-2">
                 <div className="bg-[#F0B132] p-3 rounded text-sm text-black font-medium border border-orange-600/20">
                    <span className="font-bold">Warning:</span> By deleting this channel, you will lose all messages and history within it.
                 </div>
             </div>
        )}

        {/* Footer */}
        <div className="bg-[#2B2D31] p-4 flex justify-end items-center mt-2 space-x-3">
            <button 
                type="button" 
                onClick={closeModal}
                className="text-white hover:underline text-sm font-medium px-4"
            >
                Cancel
            </button>
            <button
                onClick={handleSubmit}
                disabled={isLoading || (!name.trim() && activeModal !== 'deleteChannel' && activeModal !== 'deleteMessage')}
                className={clsx(
                    "px-6 py-2 rounded-[3px] font-medium text-sm transition-colors text-white",
                    (activeModal === 'deleteChannel' || activeModal === 'deleteMessage') 
                        ? "bg-red-500 hover:bg-red-600" 
                        : "bg-mew-accent hover:bg-mew-accentHover",
                    (isLoading || (!name.trim() && activeModal !== 'deleteChannel' && activeModal !== 'deleteMessage')) && "opacity-50 cursor-not-allowed"
                )}
            >
                {activeModal === 'createServer' ? 'Create' : 
                 activeModal === 'deleteChannel' ? 'Delete Channel' : 
                 activeModal === 'deleteMessage' ? 'Delete' : 'Create Channel'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default Modal;
