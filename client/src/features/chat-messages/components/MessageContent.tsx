import React from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { Message } from '../../../shared/types';
import { parseMessageContent } from '../../../shared/utils/messageParser';
import { AttachmentList } from '../../chat-attachments/components/AttachmentList';
import ForwardCard from './ForwardCard';
import { BilibiliCard, ClaudeCodeCard, InstagramCard, JpdictCard, PornhubCard, RssCard, TwitterCard, UrlEmbed } from '../../chat-embeds';
import { VoiceMessagePlayer } from '../../chat-voice/components/VoiceMessagePlayer';
import { useI18n } from '../../../shared/i18n';

interface MessageContentProps {
    message: Message;
    serverId?: string;
    channelId?: string;
    showVoiceTranscript?: boolean;
    voiceTranscriptLoading?: boolean;
}

const MessageContent: React.FC<MessageContentProps> = ({ message, serverId, channelId, showVoiceTranscript, voiceTranscriptLoading }) => {
    const { t } = useI18n();
    const isRssCard = message.type === 'app/x-rss-card';
    const isPornhubCard = message.type === 'app/x-pornhub-card';
    const isTwitterCard = message.type === 'app/x-twitter-card';
    const isBilibiliCard = message.type === 'app/x-bilibili-card';
    const isInstagramCard = message.type === 'app/x-instagram-card';
    const isForwardCard = message.type === 'app/x-forward-card';
    const isJpdictCard = message.type === 'app/x-jpdict-card';
    const isClaudeCodeCard = message.type === 'app/x-claudecode-card';
    const isVoiceMessage = message.type === 'message/voice';

    if (isForwardCard && message.payload) {
        return <ForwardCard payload={message.payload} serverId={serverId} channelId={channelId} />;
    }

    if (isJpdictCard && message.payload) {
        return <JpdictCard payload={message.payload} />;
    }

    if (isClaudeCodeCard) {
        return <ClaudeCodeCard content={message.content} payload={message.payload} />;
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
        const transcript = (typeof message.plainText === 'string' ? message.plainText : '').trim();

        if (!src) {
          return (
            <div className="flex items-center gap-2 p-2 rounded bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                <Icon icon="mdi:alert-circle-outline" width="16" />
                <span>{t('message.voice.unavailable')}</span>
            </div>
          );
        }

        return (
          <div className="flex flex-col items-start gap-1 max-w-[360px]">
            {/* 语音播放器主体 */}
            <VoiceMessagePlayer src={src} contentType={contentType} durationMs={durationMs} />
            
            {/* 转录文本区域 */}
            {showVoiceTranscript && (
              <div className={clsx(
                  "w-full mt-1 pl-1 border-l-2 transition-all duration-300",
                  voiceTranscriptLoading ? "border-mew-textMuted/30" : "border-[#5865F2]"
              )}>
                <div className="pl-2 flex flex-col gap-1">
                   {/* 转录标题 (Metadata style) */}
                   <div className="flex items-center gap-1.5 select-none">
                      <Icon icon="mdi:text-recognition" className="w-3.5 h-3.5 text-mew-textMuted" />
                      <span className="text-[10px] font-bold text-mew-textMuted uppercase tracking-wide opacity-80">
                        {t('message.voice.transcription')}
                      </span>
                   </div>

                   {/* 内容主体 */}
                   <div className={clsx(
                     "text-[0.95rem] leading-[1.375rem] text-[#DBDEE1] whitespace-pre-wrap break-words min-h-[1.5rem]",
                     voiceTranscriptLoading && "flex items-center"
                   )}>
                      {voiceTranscriptLoading ? (
                         // 仿 Discord 打字动画 (Typing indicator)
                         <div className="flex items-center gap-1 py-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-mew-textMuted animate-[bounce_1.4s_infinite_ease-in-out_0ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-mew-textMuted animate-[bounce_1.4s_infinite_ease-in-out_200ms]" />
                            <span className="w-1.5 h-1.5 rounded-full bg-mew-textMuted animate-[bounce_1.4s_infinite_ease-in-out_400ms]" />
                         </div>
                      ) : transcript ? (
                         transcript
                      ) : (
                         <span className="text-sm italic text-mew-textMuted opacity-80">
                           {t('message.voice.noSpeechDetected')}
                         </span>
                      )}
                   </div>
                </div>
              </div>
            )}
          </div>
        );
    }

    return (
        <div className="w-full">
            {/* Sticker Display */}
            {message.payload?.sticker?.url && (
              <div className="mt-1 mb-1 block">
                <img
                  src={message.payload.sticker.url}
                  alt={message.payload.sticker.name || t('sticker.defaultName')}
                  title={message.payload.sticker.name || undefined}
                  // Discord sticker size + hover effect
                  className="max-w-[120px] max-h-[120px] w-auto h-auto object-contain select-none cursor-pointer hover:scale-[1.02] transition-transform duration-200"
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
