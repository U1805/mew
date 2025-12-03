import React, { useState, useEffect } from 'react';
import { useModalStore, useUIStore } from '@/shared/stores/store';
import { userApi, channelApi } from '@/shared/services/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import { User } from '@/shared/types';

export const FindUserModal: React.FC = () => {
  const { closeModal } = useModalStore();
  const queryClient = useQueryClient();

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data: searchResults, isFetching: isSearching } = useQuery({
    queryKey: ['userSearch', debouncedQuery],
    queryFn: async () => {
        if (!debouncedQuery) return [];
        const res = await userApi.search(debouncedQuery);
        return res.data as User[];
    },
    enabled: !!debouncedQuery
  });

  const handleCreateDM = async (user: User) => {
    if (loadingUserId) return;
    setLoadingUserId(user._id);

    try {
        const res = await channelApi.createDM(user._id);
        const channel = res.data;
        useUIStore.getState().setCurrentServer(null);
        useUIStore.getState().setCurrentChannel(channel._id);
        queryClient.invalidateQueries({ queryKey: ['dmChannels'] });
        closeModal();
    } catch (error) {
        console.error("Failed to create DM", error);
    } finally {
        setLoadingUserId(null);
    }
  };

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
                        <div
                            key={user._id}
                            className={`flex items-center justify-between p-2 rounded hover:bg-[#35373C] group cursor-pointer ${loadingUserId === user._id ? 'opacity-50' : ''}`}
                            onClick={() => handleCreateDM(user)}
                        >
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