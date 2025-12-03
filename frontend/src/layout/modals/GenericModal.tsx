import React, { useState, useEffect } from 'react';
import { useModalStore, useUIStore } from '@/shared/stores/store';
import { serverApi, channelApi, categoryApi, messageApi } from '@/shared/services/api';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { format } from 'date-fns';

export const GenericModal: React.FC = () => {
  const { activeModal, closeModal, modalData, openModal } = useModalStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setName('');
  }, [activeModal]);

  const isDeleteType = [
      'deleteChannel', 'deleteMessage', 'deleteCategory', 'deleteServer', 'leaveServer'
  ].includes(activeModal || '');

  const getTitle = () => {
      switch (activeModal) {
          case 'createServer': return 'Customize Your Server';
          case 'createCategory': return 'Create Category';
          case 'createChannel': return 'Create Channel';
          case 'deleteChannel': return 'Delete Channel';
          case 'deleteMessage': return 'Delete Message';
          case 'deleteCategory': return 'Delete Category';
          case 'deleteServer': return 'Delete Server';
          case 'leaveServer': return 'Leave Server';
          default: return '';
      }
  };

  const getLabel = () => {
      switch (activeModal) {
          case 'createServer': return 'Server Name';
          case 'createCategory': return 'Category Name';
          case 'createChannel': return 'Channel Name';
          default: return 'Name';
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() && !isDeleteType) return;

    setIsLoading(true);
    try {
      switch (activeModal) {
        case 'createServer':
          await serverApi.create({ name });
          queryClient.invalidateQueries({ queryKey: ['servers'] });
          break;
        case 'createCategory':
          if(currentServerId) {
            await categoryApi.create(currentServerId, { name });
            queryClient.invalidateQueries({ queryKey: ['categories', currentServerId] });
          }
          break;
        case 'createChannel':
          if(currentServerId) {
            await channelApi.create(currentServerId, { name, type: 'GUILD_TEXT', categoryId: modalData?.categoryId });
            queryClient.invalidateQueries({ queryKey: ['channels', currentServerId] });
          }
          break;
        case 'deleteChannel':
          if(currentServerId && modalData?.channel) {
            await channelApi.delete(currentServerId, modalData.channel._id);
            queryClient.setQueryData(['channels', currentServerId], (old: any[]) => old?.filter(c => c._id !== modalData.channel._id) || []);
          }
          break;
        case 'deleteMessage':
          if(currentServerId && modalData?.message) {
            await messageApi.delete(currentServerId, modalData.message.channelId, modalData.message._id);
            queryClient.setQueryData(['messages', modalData.message.channelId], (old: any[]) => {
                if (!old) return old;
                return old.filter(m => m._id !== modalData.message._id);
            });
          }
          break;
        case 'deleteCategory':
          if(modalData?.category) {
            await categoryApi.delete(modalData.category._id);
            queryClient.invalidateQueries({ queryKey: ['categories', currentServerId] });
            queryClient.invalidateQueries({ queryKey: ['channels', currentServerId] });
          }
          break;
        case 'deleteServer':
          if(modalData?.server) {
            await serverApi.delete(modalData.server._id);
            useUIStore.getState().setCurrentServer(null);
            queryClient.invalidateQueries({ queryKey: ['servers'] });
          }
          break;
        case 'leaveServer':
          if(modalData?.serverId) {
            await serverApi.leaveServer(modalData.serverId);
            queryClient.setQueryData(['servers'], (oldData: any[] | undefined) =>
                oldData ? oldData.filter(server => server._id !== modalData.serverId) : []
            );
            useUIStore.getState().setCurrentServer(null);
            queryClient.invalidateQueries({ queryKey: ['servers'] });
          }
          break;
      }
      closeModal();
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#313338] w-full max-w-md rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in">

        <div className="p-4 pt-5 pb-3">
            <h2 className="text-xl font-bold text-white mb-2">{getTitle()}</h2>
            <p className="text-mew-textMuted text-sm leading-5">
                {activeModal === 'createServer' ? "Give your new server a personality with a name and an icon. You can always change it later." : ""}
                {activeModal === 'createChannel' && modalData?.categoryName ? `in ${modalData.categoryName}` : ""}
                {activeModal === 'deleteChannel' && `Are you sure you want to delete #${modalData?.channel?.name}? This cannot be undone.`}
                {activeModal === 'deleteMessage' && "Are you sure you want to delete this message?"}
                {activeModal === 'deleteCategory' && `Are you sure you want to delete the category '${modalData?.category?.name}'? Channels inside will become uncategorized.`}
                {activeModal === 'deleteServer' && `Are you sure you want to delete ${modalData?.server?.name}? This action cannot be undone.`}
                {activeModal === 'leaveServer' && "Are you sure you want to leave this server?"}
            </p>
        </div>

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
        ) : !isDeleteType ? (
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
               {activeModal === 'createServer' && (
                   <div className="mb-2 text-center">
                       <button
                           type="button"
                           className="text-mew-textMuted hover:text-white text-xs font-medium bg-[#2B2D31] px-4 py-2 rounded border border-[#1E1F22] hover:border-mew-textMuted transition-all w-full"
                           onClick={() => { closeModal(); openModal('joinServer'); }}
                       >
                           Have an invite already? Join a Server
                       </button>
                   </div>
               )}
            </form>
        ) : (activeModal === 'deleteChannel' || activeModal === 'deleteServer') ? (
             <div className="px-4 pb-2">
                 <div className="bg-[#F0B132] p-3 rounded text-sm text-black font-medium border border-orange-600/20">
                    <span className="font-bold">Warning:</span> {activeModal === 'deleteServer' ? 'This server will be permanently deleted.' : 'By deleting this channel, you will lose all messages and history within it.'}
                 </div>
             </div>
        ) : null}

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
                disabled={isLoading || (!name.trim() && !isDeleteType)}
                className={clsx(
                    "px-6 py-2 rounded-[3px] font-medium text-sm transition-colors text-white",
                    isDeleteType
                        ? "bg-red-500 hover:bg-red-600"
                        : "bg-mew-accent hover:bg-mew-accentHover",
                    (isLoading || (!name.trim() && !isDeleteType)) && "opacity-50 cursor-not-allowed"
                )}
            >
                {activeModal === 'createServer' ? 'Create' :
                 activeModal === 'deleteChannel' ? 'Delete Channel' :
                 activeModal === 'deleteMessage' ? 'Delete' :
                 activeModal === 'deleteCategory' ? 'Delete Category' :
                 activeModal === 'deleteServer' ? 'Delete Server' :
                 activeModal === 'leaveServer' ? 'Leave Server' :
                 'Create'}
            </button>
        </div>
      </div>
    </div>
  );
};