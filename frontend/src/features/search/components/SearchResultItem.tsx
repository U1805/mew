import React from 'react';
import { format } from 'date-fns';
import { Message } from '../../../shared/types';

interface SearchResultItemProps {
    message: Message;
    channelName?: string;
    searchQuery?: string;
    onClick: () => void;
}

export const SearchResultItem: React.FC<SearchResultItemProps> = ({ message, channelName, searchQuery, onClick }) => {
    const author = typeof message.authorId === 'object' ? message.authorId : { username: 'Unknown', avatarUrl: '' };
    const createdAt = message.createdAt ? new Date(message.createdAt) : new Date();

    const highlightedContent = React.useMemo(() => {
        if (!searchQuery || !message.content) return message.content;

        // Escape regex special characters
        const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = message.content.split(new RegExp(`(${escapedQuery})`, 'gi'));

        return parts.map((part, i) => 
            part.toLowerCase() === searchQuery.toLowerCase() ? (
                <span key={i} className="bg-[#fde047] text-black font-semibold rounded-[2px]">{part}</span>
            ) : (
                part
            )
        );
    }, [message.content, searchQuery]);

    return (
        <div 
            className="p-2 hover:bg-[#35373C] cursor-pointer rounded mb-1 group"
            onClick={onClick}
        >
            <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-mew-textMuted uppercase">
                   {channelName ? `# ${channelName}` : 'Jump to message'}
                </span>
                <span className="text-[10px] text-mew-textMuted">
                    {format(createdAt, 'MMM d, yyyy')}
                </span>
            </div>
            
            <div className="flex items-start">
                 <div className="w-8 h-8 rounded-full bg-mew-accent flex-shrink-0 mr-2 flex items-center justify-center overflow-hidden">
                    {author.avatarUrl ? (
                         <img src={author.avatarUrl} alt={author.username} className="w-full h-full object-cover" />
                    ) : (
                         <span className="text-xs font-bold text-white">{author.username?.substring(0,2).toUpperCase()}</span>
                    )}
                 </div>
                 <div className="flex-1 min-w-0">
                     <div className="flex items-center mb-0.5">
                         <span className="font-bold text-white text-sm mr-2">{author.username}</span>
                     </div>
                     <div className="text-mew-text text-sm break-words line-clamp-3">
                         {highlightedContent}
                     </div>
                 </div>
            </div>
        </div>
    );
};