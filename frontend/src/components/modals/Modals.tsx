
import React, { useState, useEffect } from 'react';
import { useModalStore, useUIStore, useAuthStore } from '../../store';
import { usePresenceStore } from '../../presenceStore';
import { serverApi, channelApi, categoryApi, messageApi, userApi, inviteApi } from '../../services/api';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { Category, User, Invite } from '../../types';
import { WebhookManager } from './WebhookManager';

const Modal: React.FC = () => {
  const { activeModal, closeModal, modalData, openModal } = useModalStore();
  const { currentServerId } = useUIStore();
  const onlineStatus = usePresenceStore((state) => state.onlineStatus);
  const queryClient = useQueryClient();
  
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Find User State
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // Join Server State
  const [inviteCode, setInviteCode] = useState('');
  const [invitePreview, setInvitePreview] = useState<Invite | null>(null);
  const [joinError, setJoinError] = useState('');

  // Create Invite State
  const [createdInviteUrl, setCreatedInviteUrl] = useState('');
  const [isCopied, setIsCopied] = useState(false);

  // Channel Settings Tabs
  const [activeTab, setActiveTab] = useState<'overview' | 'integrations'>('overview');

  // Initialize state based on modal type and data
  useEffect(() => {
      if (!activeModal) {
          setName('');
          setCategoryId('');
          setIsLoading(false);
          setSearchQuery('');
          setDebouncedQuery('');
          setActiveTab('overview');
          setInviteCode('');
          setInvitePreview(null);
          setJoinError('');
          setCreatedInviteUrl('');
          setIsCopied(false);
          return;
      }

      if (activeModal === 'channelSettings' && modalData?.channel) {
          setName(modalData.channel.name || '');
          setCategoryId(modalData.channel.categoryId || '');
      } else if (activeModal === 'serverSettings' && modalData?.server) {
          setName(modalData.server.name || '');
      } else if (activeModal === 'editCategory' && modalData?.category) {
          setName(modalData.category.name || '');
      } else if (activeModal === 'joinServer' && modalData?.code) {
          // If modal opened with code (from URL), fetch preview immediately
          const code = modalData.code;
          setInviteCode(code);
          handleFetchInvite(code);
      } else if (activeModal === 'createInvite' && currentServerId) {
          // Generate invite immediately
          handleCreateInvite();
      } else {
          setName('');
      }
  }, [activeModal, modalData]);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch categories for Channel Settings dropdown
  const { data: categories } = useQuery({
    queryKey: ['categories', currentServerId],
    queryFn: async () => {
        if (!currentServerId) return [];
        const res = await categoryApi.list(currentServerId);
        return res.data as Category[];
    },
    enabled: !!currentServerId && activeModal === 'channelSettings'
  });

  // Query for Find User
  const { data: searchResults, isFetching: isSearching } = useQuery({
    queryKey: ['userSearch', debouncedQuery],
    queryFn: async () => {
        if (!debouncedQuery) return [];
        const res = await userApi.search(debouncedQuery);
        return res.data as User[];
    },
    enabled: activeModal === 'findUser' && !!debouncedQuery
  });

  if (!activeModal) return null;

  const handleCreateInvite = async () => {
      if (!currentServerId) return;
      try {
          const res = await inviteApi.create(currentServerId, {});
          const invite = res.data as Invite;
          setCreatedInviteUrl(`${window.location.origin}/invite/${invite.code}`);
      } catch (e) {
          console.error("Failed to create invite", e);
      }
  };

  const handleFetchInvite = async (code: string) => {
      setIsLoading(true);
      setJoinError('');
      try {
          const res = await inviteApi.get(code);
          setInvitePreview(res.data);
      } catch (e) {
          setJoinError("Invalid or expired invite code.");
          setInvitePreview(null);
      } finally {
          setIsLoading(false);
      }
  };

  const handleJoinServer = async () => {
      if (!invitePreview || !inviteCode) return;
      setIsLoading(true);
      try {
          await inviteApi.accept(inviteCode);
          await queryClient.invalidateQueries({ queryKey: ['servers'] });
          useUIStore.getState().setCurrentServer(invitePreview.serverId);
          closeModal();
      } catch (e) {
          setJoinError("Failed to join server.");
      } finally {
          setIsLoading(false);
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Allow submit if it's a delete action (name not required)
    const isDelete = activeModal === 'deleteChannel' || activeModal === 'deleteMessage' || activeModal === 'deleteCategory' || activeModal === 'deleteServer' || activeModal === 'leaveServer' || activeModal === 'kickUser';
    if (!name.trim() && !isDelete) return;

    setIsLoading(true);
    try {
      if (activeModal === 'createServer') {
        await serverApi.create({ name });
        queryClient.invalidateQueries({ queryKey: ['servers'] });
      } else if (activeModal === 'createCategory' && currentServerId) {
        await categoryApi.create(currentServerId, { name });
        queryClient.invalidateQueries({ queryKey: ['categories', currentServerId] });
      } else if (activeModal === 'editCategory' && modalData?.category) {
        await categoryApi.update(modalData.category._id, { name });
        queryClient.invalidateQueries({ queryKey: ['categories', currentServerId] });
      } else if (activeModal === 'deleteCategory' && modalData?.category) {
        await categoryApi.delete(modalData.category._id);
        queryClient.invalidateQueries({ queryKey: ['categories', currentServerId] });
        queryClient.invalidateQueries({ queryKey: ['channels', currentServerId] }); // Channels might become uncategorized
      } else if (activeModal === 'createChannel' && currentServerId) {
        await channelApi.create(currentServerId, { 
            name, 
            type: 'GUILD_TEXT',
            categoryId: modalData?.categoryId 
        });
        queryClient.invalidateQueries({ queryKey: ['channels', currentServerId] });
      } else if (activeModal === 'deleteChannel' && currentServerId) {
         await channelApi.delete(currentServerId, modalData.channel._id);
         queryClient.setQueryData(['channels', currentServerId], (old: any[]) => old?.filter(c => c._id !== modalData.channel._id) || []);
      } else if (activeModal === 'deleteMessage' && currentServerId && modalData?.message) {
          await messageApi.delete(currentServerId, modalData.message.channelId, modalData.message._id);
          // Optimistic update
          queryClient.setQueryData(['messages', modalData.message.channelId], (old: any[]) => {
              if (!old) return old;
              return old.filter(m => m._id !== modalData.message._id);
          });
      } else if (activeModal === 'deleteServer' && modalData?.server) {
          await serverApi.delete(modalData.server._id);
          useUIStore.getState().setCurrentServer(null);
          queryClient.invalidateQueries({ queryKey: ['servers'] });
      } else if (activeModal === 'leaveServer' && modalData?.serverId) {
          await serverApi.leaveServer(modalData.serverId);
          // Optimistically remove the server from the list before invalidating
          queryClient.setQueryData(['servers'], (oldData: any[] | undefined) =>
              oldData ? oldData.filter(server => server._id !== modalData.serverId) : []
          );
          useUIStore.getState().setCurrentServer(null);
          queryClient.invalidateQueries({ queryKey: ['servers'] });
      } else if (activeModal === 'kickUser' && modalData?.user && modalData?.serverId) {
          await serverApi.kickMember(modalData.serverId, modalData.user._id);
          queryClient.invalidateQueries({ queryKey: ['members', modalData.serverId] });
      }
      
      closeModal();
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChannelUpdate = async () => {
      if (!currentServerId || !modalData?.channel) return;
      setIsLoading(true);
      try {
          // Convert empty string back to null if "No Category" is selected
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

  const handleCreateDM = async (recipientId: string) => {
    if (!recipientId) return;
    setIsLoading(true);
    try {
        const res = await channelApi.createDM(recipientId);
        const channel = res.data;
        useUIStore.getState().setCurrentServer(null);
        useUIStore.getState().setCurrentChannel(channel._id);
        queryClient.invalidateQueries({ queryKey: ['dmChannels'] });
        closeModal();
    } catch (error) {
        console.error("Failed to create DM", error);
    } finally {
        setIsLoading(false);
    }
  };

  // --- Modal Content Logic ---

  if (activeModal === 'createInvite') {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
             <div className="bg-[#313338] w-full max-w-md rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in p-4">
                 <div className="flex justify-between items-center mb-2">
                     <h2 className="text-sm font-bold text-white uppercase">Invite Friends</h2>
                     <Icon icon="mdi:close" className="text-mew-textMuted cursor-pointer hover:text-white" onClick={closeModal} />
                 </div>
                 <div className="text-mew-text text-sm mb-4">
                     Share this link with others to grant them access to this server.
                 </div>
                 <div className="relative">
                     <input 
                        readOnly 
                        value={createdInviteUrl || 'Generating...'} 
                        className="w-full bg-[#1E1F22] text-white p-2.5 rounded border border-[#1E1F22] focus:border-mew-accent focus:outline-none text-sm font-medium" 
                     />
                     <button 
                        className={clsx(
                            "absolute right-1 top-1 h-[34px] px-4 rounded text-white text-sm font-medium transition-colors min-w-[70px]",
                            !createdInviteUrl ? "bg-[#404249] cursor-not-allowed" :
                            isCopied ? "bg-green-500 hover:bg-green-600" : "bg-mew-accent hover:bg-mew-accentHover"
                        )}
                        onClick={() => {
                            if (createdInviteUrl) {
                                navigator.clipboard.writeText(createdInviteUrl);
                                setIsCopied(true);
                                setTimeout(() => setIsCopied(false), 2000);
                            }
                        }}
                     >
                         {isCopied ? 'Copied' : 'Copy'}
                     </button>
                 </div>
                 <div className="text-xs text-mew-textMuted mt-2">
                     Your invite link expires in 7 days. <span className="text-mew-accent hover:underline cursor-pointer">Edit link</span>
                 </div>
             </div>
        </div>
      );
  }

  if (activeModal === 'joinServer') {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
             <div className="bg-[#313338] w-full max-w-md rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in p-6 text-center">
                 <h2 className="text-2xl font-bold text-white mb-2">Join a Server</h2>
                 <p className="text-mew-textMuted text-sm mb-6">Enter an invite below to join an existing server.</p>
                 
                 {!invitePreview ? (
                    <div className="text-left">
                        <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Invite Link</label>
                        <input
                            type="text"
                            value={inviteCode}
                            onChange={(e) => {
                                const val = e.target.value;
                                // Extract code if full URL pasted
                                const code = val.split('/').pop() || val;
                                setInviteCode(code);
                                if (code.length > 5) handleFetchInvite(code);
                            }}
                            className="w-full bg-[#1E1F22] text-white p-2.5 rounded border border-[#1E1F22] focus:border-mew-accent focus:outline-none text-sm font-medium mb-2"
                            placeholder="https://mew.com/invite/..."
                        />
                         {joinError && <div className="text-red-400 text-xs mb-2">{joinError}</div>}
                    </div>
                 ) : (
                    <div className="bg-[#2B2D31] p-4 rounded mb-6 flex flex-col items-center animate-fade-in-up">
                        <div className="w-16 h-16 rounded-[20px] bg-mew-accent flex items-center justify-center text-white text-2xl font-bold mb-3 overflow-hidden">
                             {invitePreview.server?.avatarUrl ? (
                                <img src={invitePreview.server.avatarUrl} className="w-full h-full object-cover" />
                             ) : (
                                invitePreview.server?.name?.substring(0, 2).toUpperCase()
                             )}
                        </div>
                        <div className="text-white font-bold truncate max-w-full">{invitePreview.server?.name}</div>
                        <div className="text-mew-textMuted text-xs flex items-center mt-1">
                            <span className="w-2 h-2 rounded-full bg-mew-textMuted mr-1.5"></span>
                            {invitePreview.server?.memberCount ?? '?'} Members
                        </div>
                    </div>
                 )}

                 <div className="flex justify-between items-center mt-2">
                     <button onClick={closeModal} className="text-white hover:underline text-sm font-medium">Back</button>
                     <button 
                        onClick={invitePreview ? handleJoinServer : () => handleFetchInvite(inviteCode)}
                        disabled={isLoading || !inviteCode}
                        className={clsx(
                            "bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2.5 rounded-[3px] font-medium text-sm transition-colors",
                            (isLoading || !inviteCode) && "opacity-50 cursor-not-allowed"
                        )}
                     >
                         {invitePreview ? 'Join Server' : 'Find Server'}
                     </button>
                 </div>
             </div>
        </div>
      )
  }
  
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
                    
                    <div 
                        className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text font-medium text-sm cursor-pointer mb-0.5 flex justify-between group"
                        onClick={() => useModalStore.getState().openModal('deleteServer', modalData)}
                    >
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

  // Special layout for Channel Settings
  if (activeModal === 'channelSettings') {
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
                        onClick={() => useModalStore.getState().openModal('deleteChannel', modalData)}
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
                            
                            {/* Category Selection */}
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
  }
  
  // Special layout for Category Settings
  if (activeModal === 'editCategory') {
     return (
        <div className="fixed inset-0 z-50 flex bg-[#313338] animate-fade-in text-mew-text font-sans">
             <div className="w-[30%] min-w-[220px] bg-[#2B2D31] flex flex-col items-end pt-[60px] pb-4 px-2">
                 <div className="w-[192px] px-1.5">
                    <h2 className="text-xs font-bold text-mew-textMuted uppercase mb-3 px-2.5 text-ellipsis overflow-hidden whitespace-nowrap">
                        CATEGORY SETTINGS
                    </h2>
                    <div className="px-2.5 py-1.5 rounded-[4px] bg-[#404249] text-white font-medium text-sm cursor-pointer mb-0.5">Overview</div>
                    
                    <div className="h-[1px] bg-mew-divider my-2 mx-2 opacity-50"></div>
                    
                    <div 
                        className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text font-medium text-sm cursor-pointer mb-0.5 flex justify-between group"
                        onClick={() => useModalStore.getState().openModal('deleteCategory', modalData)}
                    >
                        <span className="text-red-400">Delete Category</span>
                        <Icon icon="mdi:trash-can-outline" className="hidden group-hover:block text-red-400" />
                    </div>
                 </div>
             </div>
             <div className="flex-1 bg-[#313338] pt-[60px] px-10 max-w-[740px]">
                 <h2 className="text-xl font-bold text-white mb-6">Overview</h2>
                 <form onSubmit={handleSubmit} className="space-y-4">
                     <div>
                        <label className="block text-xs font-bold text-mew-textMuted uppercase mb-2">Category Name</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full bg-[#1E1F22] text-white p-2.5 rounded border-none focus:outline-none focus:ring-0 font-medium"
                            autoFocus
                        />
                     </div>
                     <div className="flex gap-4 pt-4">
                         <button type="submit" className="bg-mew-accent hover:bg-mew-accentHover text-white px-6 py-2 rounded-[3px] font-medium text-sm transition-colors">Save Changes</button>
                         <button type="button" onClick={closeModal} className="text-white hover:underline text-sm font-medium px-2 self-center">Cancel</button>
                     </div>
                 </form>
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

  // Find User Modal
  if (activeModal === 'findUser') {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className="bg-[#313338] w-full max-w-lg rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in max-h-[600px]">
                <div className="p-4 pt-5">
                    <h2 className="text-xl font-bold text-white mb-2">Find or start a conversation</h2>
                    <p className="text-mew-textMuted text-sm">Search for a user by their username to start a direct message.</p>
                </div>
                
                <div className="px-4 mb-4">
                     <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#1E1F22] text-white p-3 rounded border border-[#1E1F22] focus:border-mew-accent focus:outline-none font-medium placeholder-mew-textMuted"
                        placeholder="Where would you like to go?"
                        autoFocus
                    />
                </div>

                <div className="flex-1 overflow-y-auto px-2 pb-2 custom-scrollbar space-y-1">
                    {isSearching ? (
                        <div className="flex justify-center p-4 text-mew-textMuted">
                            <Icon icon="mdi:loading" className="animate-spin" width="24" />
                        </div>
                    ) : searchResults?.length === 0 && debouncedQuery ? (
                        <div className="text-center p-4 text-mew-textMuted">
                            No users found.
                        </div>
                    ) : (
                        searchResults?.map(user => (
                            <div key={user._id} className="flex items-center justify-between p-2 rounded hover:bg-[#35373C] group cursor-pointer" onClick={() => handleCreateDM(user._id)}>
                                <div className="flex items-center">
                                    <div className="w-8 h-8 rounded-full bg-mew-accent flex items-center justify-center text-white font-bold mr-3 overflow-hidden">
                                        {user.avatarUrl ? (
                                            <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                                        ) : (
                                            user.username.substring(0, 2).toUpperCase()
                                        )}
                                    </div>
                                    <div className="font-medium text-white">{user.username}</div>
                                </div>
                                <Icon icon="mdi:message-outline" className="text-mew-textMuted group-hover:text-white" />
                            </div>
                        ))
                    )}
                    
                    {!debouncedQuery && !isSearching && (
                        <div className="text-center p-8 text-mew-textMuted text-sm">
                             Start typing to search for friends.
                        </div>
                    )}
                </div>
                
                <div className="bg-[#2B2D31] p-4 flex justify-end">
                    <button onClick={closeModal} className="text-white hover:underline text-sm font-medium">Close</button>
                </div>
            </div>
        </div>
    )
  }

  // User Profile Modal
  if (activeModal === 'userProfile' && modalData?.user) {
      const user = modalData.user as User;
      const isOnline = onlineStatus[user._id] === 'online';
      
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
             <div className="bg-[#232428] w-[600px] rounded-lg shadow-2xl overflow-hidden animate-scale-in relative">
                 <div className="h-[120px] bg-mew-accent"></div>
                 <div className="px-4 pb-4 relative">
                     <div className="absolute -top-[50px] left-4 p-[6px] bg-[#232428] rounded-full">
                         <div className="w-[90px] h-[90px] rounded-full bg-[#1E1F22] flex items-center justify-center overflow-hidden">
                             {user.avatarUrl ? (
                                 <img src={user.avatarUrl} alt={user.username} className="w-full h-full object-cover" />
                             ) : (
                                 <span className="text-2xl font-bold text-white">{user.username.substring(0, 2).toUpperCase()}</span>
                             )}
                         </div>
                         <div className={clsx(
                             "absolute bottom-1 right-1 w-6 h-6 rounded-full border-[4px] border-[#232428]",
                             isOnline ? "bg-green-500" : "bg-gray-500"
                         )}></div>
                     </div>
                     
                     <div className="flex justify-end pt-3 mb-2">
                          <button 
                            onClick={() => handleCreateDM(user._id)}
                            disabled={isLoading}
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
                          >
                              Send Message
                          </button>
                          <button 
                             onClick={closeModal} 
                             className="ml-2 w-8 h-8 rounded-full bg-[#2B2D31] hover:bg-[#404249] flex items-center justify-center text-mew-textMuted hover:text-white transition-colors"
                          >
                              <Icon icon="mdi:close" />
                          </button>
                     </div>

                     <div className="mt-8 bg-[#111214] rounded-lg p-3">
                         <h2 className="text-xl font-bold text-white mb-0.5">{user.username}</h2>
                         <div className="text-sm text-mew-textMuted mb-4">#{user._id.slice(0, 4)}</div>
                         
                         <div className="h-[1px] bg-mew-divider mb-3"></div>
                         
                         <div className="mb-3">
                             <div className="text-xs font-bold text-mew-textMuted uppercase mb-1">Member Since</div>
                             <div className="text-sm text-mew-text">{format(new Date(user.createdAt), 'MMM d, yyyy')}</div>
                         </div>
                         
                         <div>
                             <div className="text-xs font-bold text-mew-textMuted uppercase mb-1">Note</div>
                             <input type="text" placeholder="Click to add a note" className="w-full bg-transparent text-xs text-white placeholder-mew-textMuted focus:outline-none" />
                         </div>
                     </div>
                 </div>
             </div>
        </div>
      )
  }

  // Kick User Modal - NEW
  if (activeModal === 'kickUser' && modalData?.user) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
             <div className="bg-[#313338] w-full max-w-[440px] rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in">
                 <div className="p-4 pt-5">
                     <h2 className="text-xl font-bold text-white mb-4">Kick '{modalData.user.username}'</h2>
                     <p className="text-mew-textMuted text-sm leading-5">
                        Are you sure you want to kick <span className="font-semibold text-white">@{modalData.user.username}</span> from the server? They will be able to rejoin again with a new invite.
                     </p>
                 </div>
                 
                 <div className="bg-[#2B2D31] p-4 flex justify-end items-center space-x-3">
                     <button 
                        type="button" 
                        onClick={closeModal}
                        className="text-white hover:underline text-sm font-medium px-4"
                     >
                         Cancel
                     </button>
                     <button
                        onClick={handleSubmit}
                        disabled={isLoading}
                        className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-[3px] font-medium text-sm transition-colors"
                     >
                         Kick
                     </button>
                 </div>
             </div>
        </div>
      )
  }

  // Generic Dialog Modal (Create X, Delete X)
  const isDeleteType = activeModal === 'deleteChannel' || activeModal === 'deleteMessage' || activeModal === 'deleteCategory' || activeModal === 'deleteServer' || activeModal === 'leaveServer' || activeModal === 'kickUser';
  
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
          // kickUser handled above
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
                {activeModal === 'deleteCategory' && `Are you sure you want to delete the category '${modalData?.category?.name}'? Channels inside will become uncategorized.`}
                {activeModal === 'deleteServer' && `Are you sure you want to delete ${modalData?.server?.name}? This action cannot be undone.`}
                {activeModal === 'leaveServer' && "Are you sure you want to leave this server?"}
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
             // Delete Warning Visual
             <div className="px-4 pb-2">
                 <div className="bg-[#F0B132] p-3 rounded text-sm text-black font-medium border border-orange-600/20">
                    <span className="font-bold">Warning:</span> {activeModal === 'deleteServer' ? 'This server will be permanently deleted.' : 'By deleting this channel, you will lose all messages and history within it.'}
                 </div>
             </div>
        ) : null}

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
                 // kickUser handled separately above
                 'Create'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default Modal;
