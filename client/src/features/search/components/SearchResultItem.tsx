import { useMemo } from 'react';
import { parseMessageContent } from '../../../shared/utils/messageParser';
import { Message } from '../../../shared/types';
import { useI18n } from '../../../shared/i18n';
import { formatDateTime } from '../../../shared/utils/dateTime';

interface SearchResultItemProps {
    message: Message;
    channelName?: string;
    searchQuery?: string;
    onClick: () => void;
}

export const SearchResultItem = ({ message, channelName, searchQuery, onClick }: SearchResultItemProps) => {
    const { locale } = useI18n();
    const author = typeof message.authorId === 'object' ? message.authorId : { username: 'Unknown', avatarUrl: '' };
    const createdAt = message.createdAt ? new Date(message.createdAt) : new Date();

    const highlightedContent = useMemo(() => {
        if (!message.content) return '';

        const mentionParsedContent = parseMessageContent(message.content);

        if (searchQuery) {
            const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${escapedQuery})`, 'gi');

            return mentionParsedContent.flatMap((part, i) => {
                if (part && typeof part.type === 'function' && part.type.name === 'Mention') {
                    return part;
                } else if (part && typeof part.props?.children === 'string') {
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

        return mentionParsedContent;

    }, [message.content, searchQuery]);

    return (
        <div 
            className="p-3 hover:bg-[#35373C] cursor-pointer rounded-md mb-1 group transition-colors bg-[#2B2D31] md:bg-transparent border border-[#1E1F22] md:border-transparent"
            onClick={onClick}
        >
            <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-mew-textMuted uppercase flex items-center gap-1">
                   {channelName ? (
                       <>
                        <span className="opacity-50">#</span> {channelName}
                       </>
                   ) : 'Jump to message'}
                </span>
                <span className="text-[10px] text-mew-textMuted">
                    {formatDateTime(createdAt, locale, { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
            </div>
            
            <div className="flex items-start">
                 <div className="w-9 h-9 rounded-full bg-mew-accent flex-shrink-0 mr-3 flex items-center justify-center overflow-hidden">
                    {author.avatarUrl ? (
                         <img src={author.avatarUrl} alt={author.username} className="w-full h-full object-cover" />
                    ) : (
                         <span className="text-sm font-bold text-white">{author.username?.substring(0,1).toUpperCase()}</span>
                    )}
                 </div>
                 <div className="flex-1 min-w-0">
                     <div className="flex items-center mb-0.5">
                         <span className="font-bold text-white text-sm mr-2">{author.username}</span>
                     </div>
                     <div className="text-mew-text text-[13px] md:text-sm break-words line-clamp-3 leading-snug">
                         {highlightedContent}
                     </div>
                 </div>
            </div>
        </div>
    );
};
