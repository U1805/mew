import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import { useUIStore } from '../../../shared/stores';
import { SearchResultItem } from './SearchResultItem';
import { Channel } from '../../../shared/types';
import { useMessageSearch } from '../hooks/useMessageSearch';

export const SearchResultsPanel = () => {
    const { currentServerId, searchQuery, isSearchOpen, setSearchOpen, setCurrentChannel, setTargetMessageId } = useUIStore();
    const queryClient = useQueryClient();

    const { data: searchData, isLoading } = useMessageSearch(currentServerId, searchQuery, isSearchOpen);

    if (!isSearchOpen || !currentServerId) return null;

    const messages = searchData?.messages || [];
    const channels = queryClient.getQueryData<Channel[]>(['channels', currentServerId]);

    const handleResultClick = (channelId: string, messageId: string) => {
        setCurrentChannel(channelId);
        setTargetMessageId(messageId);
        setSearchOpen(false);
    };

    return (
        <div className="w-[420px] bg-[#2B2D31] border-l border-[#1E1F22] flex flex-col shadow-xl z-10 animate-fade-in absolute right-0 top-0 bottom-0">
            <div className="h-12 flex items-center px-4 border-b border-[#1E1F22] flex-shrink-0 bg-[#2B2D31] shadow-sm">
                <span className="font-bold text-mew-textMuted uppercase text-xs flex-1">Search Results</span>
                <button onClick={() => setSearchOpen(false)} className="text-mew-textMuted hover:text-white">
                    <Icon icon="mdi:close" width="20" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4">
                {isLoading && (
                    <div className="flex flex-col items-center justify-center mt-10 text-mew-textMuted">
                        <Icon icon="mdi:loading" className="animate-spin mb-2" width="32" />
                        <span className="text-sm">Searching...</span>
                    </div>
                )}

                {!isLoading && messages.length === 0 && searchQuery && (
                    <div className="flex flex-col items-center justify-center mt-10 text-mew-textMuted text-center">
                        <Icon icon="mdi:file-search-outline" className="mb-2" width="48" />
                        <span className="text-sm">No results found for &quot;{searchQuery}&quot;</span>
                    </div>
                )}
                
                {!isLoading && !searchQuery && (
                     <div className="flex flex-col items-center justify-center mt-10 text-mew-textMuted text-center">
                        <Icon icon="mdi:magnify" className="mb-2" width="48" />
                        <span className="text-sm">Search for messages in this server.</span>
                    </div>
                )}

                {!isLoading && messages.length > 0 && (
                    <div className="space-y-4">
                         <div className="text-xs font-bold text-mew-textMuted uppercase mb-2">
                            {messages.length} Results
                        </div>
                        {messages
                            .filter(msg => channels?.some(c => c._id === msg.channelId))
                            .map(msg => {
                            const channel = channels?.find(c => c._id === msg.channelId);
                            return (
                                <SearchResultItem 
                                    key={msg._id} 
                                    message={msg} 
                                    channelName={channel?.name}
                                    searchQuery={searchQuery}
                                    onClick={() => handleResultClick(msg.channelId, msg._id)} 
                                />
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
