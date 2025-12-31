import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
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
        <div className={clsx(
            "absolute z-30 flex flex-col shadow-xl animate-fade-in",
            // Mobile: Full coverage of the chat area
            "inset-0 bg-[#313338]",
            // Desktop: Fixed width drawer on the right
            "md:top-0 md:bottom-0 md:right-0 md:left-auto md:w-[420px] md:bg-[#2B2D31] md:border-l md:border-[#1E1F22]"
        )}>
            {/* Header: On mobile this sits below the main ChatHeader input, serves as status bar */}
            <div className="h-12 flex items-center px-4 border-b border-[#1E1F22] flex-shrink-0 bg-[#2B2D31]/50 md:bg-[#2B2D31] shadow-sm">
                <span className="font-bold text-mew-textMuted uppercase text-xs flex-1">
                    {searchQuery ? 'Results' : 'Search'}
                </span>
                {/* Close button - mostly for Desktop, as mobile closes via ChatHeader 'Cancel' */}
                <button 
                    onClick={() => setSearchOpen(false)} 
                    className="text-mew-textMuted hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
                >
                    <Icon icon="mdi:close" width="20" />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-2 md:p-4">
                {isLoading && (
                    <div className="flex flex-col items-center justify-center mt-20 text-mew-textMuted">
                        <Icon icon="mdi:loading" className="animate-spin mb-3" width="32" />
                        <span className="text-sm font-medium">Searching...</span>
                    </div>
                )}

                {!isLoading && messages.length === 0 && searchQuery && (
                    <div className="flex flex-col items-center justify-center mt-20 text-mew-textMuted text-center px-6">
                        <div className="w-16 h-16 bg-[#1E1F22] rounded-full flex items-center justify-center mb-4">
                            <Icon icon="mdi:text-search-variant" className="opacity-50" width="32" />
                        </div>
                        <span className="text-sm">No results found for <span className="font-bold text-white">&quot;{searchQuery}&quot;</span></span>
                    </div>
                )}
                
                {!isLoading && !searchQuery && (
                     <div className="flex flex-col items-center justify-center mt-20 text-mew-textMuted text-center px-6">
                        <div className="w-16 h-16 bg-[#1E1F22] rounded-full flex items-center justify-center mb-4">
                            <Icon icon="mdi:magnify" className="opacity-50" width="32" />
                        </div>
                        <span className="text-sm">Search for messages, files, and more in this server.</span>
                    </div>
                )}

                {!isLoading && messages.length > 0 && (
                    <div className="space-y-2 pb-safe-bottom">
                         <div className="text-xs font-bold text-mew-textMuted uppercase mb-2 px-2">
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
