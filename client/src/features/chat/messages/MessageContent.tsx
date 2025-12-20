
import React from 'react';
import { Message } from '../../../shared/types';
import { parseMessageContent } from '../../../shared/utils/messageParser';
import { AttachmentList } from './AttachmentList';
import { UrlEmbed } from './UrlEmbed';
import { RssCard } from './RssCard';

interface MessageContentProps {
    message: Message;
    serverId?: string;
    channelId?: string;
}

const MessageContent: React.FC<MessageContentProps> = ({ message, serverId, channelId }) => {
    const isRssCard = message.type === 'app/x-rss-card';

    if (isRssCard && message.payload) {
        return <RssCard payload={message.payload} fallbackTimestamp={message.createdAt} />;
    }

    return (
        <div>
            {message.content && (
                <p className="whitespace-pre-wrap break-words leading-[1.375rem]">
                    {parseMessageContent(message.content)}
                </p>
            )}
            {message.payload?.embeds && message.payload.embeds.length > 0 && (
              <UrlEmbed embed={message.payload.embeds[0]} />
            )}
            <AttachmentList
                attachments={message.attachments || []}
                serverId={serverId}
                channelId={channelId}
            />
        </div>
    );
};

export default MessageContent;
