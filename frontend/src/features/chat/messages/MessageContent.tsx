import React from 'react';
import { Message } from '../../../shared/types';
import { parseMessageContent } from '../../../shared/utils/messageParser';

interface MessageContentProps {
    message: Message;
}

const MessageContent: React.FC<MessageContentProps> = ({ message }) => {
    const isRssCard = message.type === 'app/x-rss-card';

    if (isRssCard && message.payload) {
        return (
            <div className="bg-mew-darker border border-mew-darkest rounded-lg overflow-hidden max-w-md mt-1">
                <div className="flex">
                    <div className="p-3 flex-1">
                        <div className="text-xs text-mew-textMuted font-bold uppercase mb-1">News Source</div>
                        <a href={message.payload.url} target="_blank" rel="noreferrer" className="text-mew-accent hover:underline font-semibold block mb-1">
                            {message.payload.title}
                        </a>
                        <p className="text-sm text-mew-textMuted line-clamp-3">{message.payload.summary}</p>
                    </div>
                    {message.payload.thumbnail_url && (
                        <div className="w-24 h-auto bg-cover bg-center" style={{ backgroundImage: `url(${message.payload.thumbnail_url})` }} />
                    )}
                </div>
            </div>
        );
    }

        return <p className="whitespace-pre-wrap break-words leading-[1.375rem]">{parseMessageContent(message.content)}</p>;
};

export default MessageContent;