import React from 'react';
import { Message } from '../../../shared/types';
import { parseMessageContent } from '../../../shared/utils/messageParser';
import { AttachmentList } from '../../chat-attachments/components/AttachmentList';
import ForwardCard from './ForwardCard';
import { BilibiliCard, InstagramCard, JpdictCard, PornhubCard, RssCard, TwitterCard, UrlEmbed } from '../../chat-embeds';
import { VoiceMessagePlayer } from '../../chat-voice/components/VoiceMessagePlayer';

interface MessageContentProps {
    message: Message;
    serverId?: string;
    channelId?: string;
}

const MessageContent: React.FC<MessageContentProps> = ({ message, serverId, channelId }) => {
    const isRssCard = message.type === 'app/x-rss-card';
    const isPornhubCard = message.type === 'app/x-pornhub-card';
    const isTwitterCard = message.type === 'app/x-twitter-card';
    const isBilibiliCard = message.type === 'app/x-bilibili-card';
    const isInstagramCard = message.type === 'app/x-instagram-card';
    const isForwardCard = message.type === 'app/x-forward-card';
    const isJpdictCard = message.type === 'app/x-jpdict-card';
    const isVoiceMessage = message.type === 'message/voice';

    if (isForwardCard && message.payload) {
        return <ForwardCard payload={message.payload} serverId={serverId} channelId={channelId} />;
    }

    if (isJpdictCard && message.payload) {
        return <JpdictCard payload={message.payload} />;
    }

    if (isRssCard && message.payload) {
        return <RssCard payload={message.payload} fallbackTimestamp={message.createdAt} />;
    }

    if (isPornhubCard && message.payload) {
        return <PornhubCard payload={message.payload} />;
    }

    if (isTwitterCard && message.payload) {
        return <TwitterCard payload={message.payload} />;
    }

    if (isBilibiliCard && message.payload) {
        return <BilibiliCard payload={message.payload} />;
    }

    if (isInstagramCard && message.payload) {
        return <InstagramCard payload={message.payload} />;
    }

    if (isVoiceMessage) {
        const voice = message.payload?.voice as any;
        const src = typeof voice?.url === 'string' ? voice.url : '';
        const contentType = typeof voice?.contentType === 'string' ? voice.contentType : undefined;
        const durationMs = typeof voice?.durationMs === 'number' ? voice.durationMs : undefined;

        return src ? (
          <VoiceMessagePlayer src={src} contentType={contentType} durationMs={durationMs} />
        ) : (
          <div className="text-mew-textMuted italic text-sm">(voice message)</div>
        );
    }

    return (
        <div className="w-full">
            {/* Sticker Display */}
            {message.payload?.sticker?.url && (
              <div className="mt-1 mb-1 block">
                <img
                  src={message.payload.sticker.url}
                  alt={message.payload.sticker.name || 'sticker'}
                  title={message.payload.sticker.name || undefined}
                  // Discord sticker size + hover effect
                  className="max-w-[160px] max-h-[160px] w-auto h-auto object-contain select-none cursor-pointer hover:scale-[1.02] transition-transform duration-200"
                  draggable={false}
                />
              </div>
            )}

            {/* Text Content */}
            {message.content && (
                <p className="whitespace-pre-wrap break-words leading-[1.375rem] text-[#DBDEE1]">
                    {parseMessageContent(message.content)}
                </p>
            )}

            {/* Embeds */}
            {message.payload?.embeds && message.payload.embeds.length > 0 && (
              <UrlEmbed embed={message.payload.embeds[0]} />
            )}

            {/* Attachments */}
            <AttachmentList
                attachments={message.attachments || []}
                serverId={serverId}
                channelId={channelId}
            />
        </div>
    );
};

export default MessageContent;
