import React from 'react';
import { parseMessageContent } from '../../../shared/utils/messageParser';
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
        if (!message.content) return '';

        // 1. First, apply mention parsing to get an array of strings and <Mention> components
        const mentionParsedContent = parseMessageContent(message.content);

        // 2. Then, if there's a search query, highlight it within the text parts
        if (searchQuery) {
            const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedQuery})`, 'gi');

            return mentionParsedContent.flatMap((part, i) => {
                if (part && typeof part.type === 'function' && part.type.name === 'Mention') {
                    // It's already a <Mention> component, so leave it as is.
                    return part;
                } else if (part && typeof part.props?.children === 'string') {
                    // It's a <span> with text content from our parser
                    const text = part.props.children;
                    const splitText = text.split(regex).map((subPart, j) => {
                        if (subPart.toLowerCase() === searchQuery.toLowerCase()) {
                            return <span key={`${i}-${j}`} className="bg-[#fde047] text-black font-semibold rounded-[2px]">{subPart}</span>;
                        }
                        return subPart;
                    });
                    return <span key={i}>{splitText}</span>;
                }
                return null;
            });
        }

        // If no search query, just return the mention-parsed content
        return mentionParsedContent;

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