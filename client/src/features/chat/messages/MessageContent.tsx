
import React from 'react';
import { Message } from '../../../shared/types';
import { parseMessageContent } from '../../../shared/utils/messageParser';
import { AttachmentList } from './AttachmentList';
import { UrlEmbed } from './UrlEmbed';
import { RssCard } from './RssCard';
import { PornhubCard } from './PornhubCard';
import { TwitterCard } from './TwitterCard';

interface MessageContentProps {
    message: Message;
    serverId?: string;
    channelId?: string;
}

const MessageContent: React.FC<MessageContentProps> = ({ message, serverId, channelId }) => {
    const isRssCard = message.type === 'app/x-rss-card';
    const isPornhubCard = message.type === 'app/x-pornhub-card';
    const isTwitterCard = message.type === 'app/x-twitter-card';

    if (isRssCard && message.payload) {
        return <RssCard payload={message.payload} fallbackTimestamp={message.createdAt} />;
    }

    if (isPornhubCard && message.payload) {
        return <PornhubCard payload={message.payload} />;
    }

    if (isTwitterCard && message.payload) {
        return <TwitterCard payload={message.payload} />;
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
