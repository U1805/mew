import { useState, useEffect, useRef, type MouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '@iconify/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import clsx from 'clsx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EmojiPicker } from './EmojiPicker';
import { MessageContextMenu } from './MessageContextMenu';
import ReactionList from './ReactionList';
import MessageContent from './MessageContent';
import MessageEditor from './MessageEditor';
import { Attachment, Message } from '../../../shared/types';
import { channelApi, infraApi, messageApi, sttApi, ttsApi } from '../../../shared/services/api';
import { useUIStore, useModalStore, useUnreadStore } from '../../../shared/stores';
import { useAuthStore } from '../../../shared/stores/authStore';
import { usePresenceStore } from '../../../shared/stores/presenceStore';
import { useVoiceSettingsStore } from '../../../shared/stores/voiceSettingsStore';
import { usePermissions } from '../../../shared/hooks/usePermissions';
import { getMessageBestEffortText } from '../../../shared/utils/messageText';
import { useI18n } from '../../../shared/i18n';
import { formatDateTime, getRelativeDay } from '../../../shared/utils/dateTime';

interface MessageItemProps {
  message: Message;
  isSequential?: boolean;
  ownedBotUserIds?: Set<string>;
  className?: string;
}

let activeTtsAudio: HTMLAudioElement | null = null;
let activeTtsUrl: string | null = null;

const stopActiveTts = () => {
  if (activeTtsAudio) {
    activeTtsAudio.pause();
    activeTtsAudio.currentTime = 0;
    activeTtsAudio = null;
  }
  if (activeTtsUrl) {
    URL.revokeObjectURL(activeTtsUrl);
    activeTtsUrl = null;
  }
};

const getSelectionTextWithin = (container: HTMLElement | null) => {
  const selection = window.getSelection?.();
  if (!selection || selection.rangeCount === 0 || !container) return '';

  const raw = selection.toString();
  const text = raw.trim();
  if (!text) return '';

  const isNodeInside = (node: Node | null) => {
    if (!node) return false;
    const element = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
    return !!element && container.contains(element);
  };

  if (!isNodeInside(selection.anchorNode) && !isNodeInside(selection.focusNode)) return '';
  return text;
};

const looksLikeIdPlaceholder = (text: string) => /^@?[0-9a-fA-F]{24}$/.test(text.trim());

const ActionTooltip = ({ label }: { label: string }) => (
  <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-0.5 flex -translate-x-1/2 translate-y-0.5 flex-col items-center opacity-0 transition-[opacity,transform] duration-150 ease-in-out group-hover/action:translate-y-0 group-hover/action:opacity-100 group-focus-visible/action:translate-y-0 group-focus-visible/action:opacity-100">
    <span className="whitespace-nowrap rounded-[4px] bg-[#3f4147] px-3 py-1.5 text-sm font-normal leading-none text-white shadow-xl">
      {label}
    </span>
    <span className="-mt-[1px] h-0 w-0 border-x-[4px] border-t-[5px] border-x-transparent border-t-[#3f4147]"></span>
  </div>
);

const MessageItem = ({ message, isSequential, ownedBotUserIds, className }: MessageItemProps) => {
  const { user } = useAuthStore();
  const { currentServerId, setCurrentServer, setCurrentChannel, setReplyTo, setTargetMessageId, targetMessageId } = useUIStore();
  const { openModal } = useModalStore();
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [applyFlash, setApplyFlash] = useState(false);
  const [jumpBlinkOn, setJumpBlinkOn] = useState(false);
  const [menuSelection, setMenuSelection] = useState('');
  const [showVoiceTranscript, setShowVoiceTranscript] = useState(false);
  const [voiceTranscriptLoading, setVoiceTranscriptLoading] = useState(false);
  const permissions = usePermissions(message.channelId);
  const { unreadMentionMessageIds, removeUnreadMention } = useUnreadStore();
  const itemRef = useRef<HTMLDivElement>(null);
  const morePointerDownRef = useRef(false);
  const suppressNextMoreClickOpenRef = useRef(false);
  const onlineStatus = usePresenceStore((state) => state.onlineStatus);
  const voiceSettings = useVoiceSettingsStore((state) => state.settings);

  const canAddReaction = permissions.has('ADD_REACTIONS');
  const canManageMessages = permissions.has('MANAGE_MESSAGES');
  const canSendMessages = permissions.has('SEND_MESSAGES');

  const author = typeof message.authorId === 'object' ? message.authorId : { username: t('common.unknown'), avatarUrl: '', _id: message.authorId as string, isBot: false, createdAt: new Date().toISOString(), email: '' };
  const isRssCard = message.type === 'app/x-rss-card';
  const isPornhubCard = message.type === 'app/x-pornhub-card';
  const isTwitterCard = message.type === 'app/x-twitter-card';
  const isBilibiliCard = message.type === 'app/x-bilibili-card';
  const isInstagramCard = message.type === 'app/x-instagram-card';
  const isTiktokCard = message.type === 'app/x-tiktok-card';
  const isForwardCard = message.type === 'app/x-forward-card';
  const isJpdictCard = message.type === 'app/x-jpdict-card';
  const isClaudeCodeCard = message.type === 'app/x-claudecode-card';
  const isVoiceMessage = message.type === 'message/voice';
  const isAppCard = isRssCard || isPornhubCard || isTwitterCard || isBilibiliCard || isInstagramCard || isTiktokCard || isForwardCard || isJpdictCard;
  const isAuthor = user?._id?.toString() === author._id?.toString();
  const canDeleteAsBotOwner = !!user && !!author?.isBot && !!ownedBotUserIds?.has(author._id?.toString());
  const isRetracted = !!message.retractedAt;
  const referencedMessage = message.referencedMessageId
    ? (queryClient.getQueryData<Message[]>(['messages', message.channelId]) || []).find(
        (m) => m._id === message.referencedMessageId
      )
    : undefined;

  const contentText = typeof message.content === 'string' ? message.content : '';
  const isMentioned = !!user && (
    (Array.isArray(message.mentions) &&
      message.mentions.some((m) => (typeof m === 'string' ? m === user._id : m?._id === user._id))) ||
    contentText.includes('@everyone') ||
    contentText.includes('@here')
  );

  useEffect(() => {
    const isUnreadMention = unreadMentionMessageIds.has(message._id);

    if (isUnreadMention) {
      if (itemRef.current) {
        const handleAnimationEnd = () => {
          setApplyFlash(false);
          setTimeout(() => removeUnreadMention(message._id), 100);
        };
        itemRef.current.addEventListener('animationend', handleAnimationEnd);
        setApplyFlash(true);

        return () => {
          itemRef.current?.removeEventListener('animationend', handleAnimationEnd);
        };
      }
    }
  }, [message._id, unreadMentionMessageIds, removeUnreadMention]);

  useEffect(() => {
    if (targetMessageId !== message._id) return;

    // Blink background every 0.5s for 2s.
    setJumpBlinkOn(true);
    const interval = window.setInterval(() => setJumpBlinkOn((v) => !v), 500);
    const stopTimer = window.setTimeout(() => {
      window.clearInterval(interval);
      setJumpBlinkOn(false);
    }, 2000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stopTimer);
      setJumpBlinkOn(false);
    };
  }, [message._id, targetMessageId]);

  const handleDelete = (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openModal('deleteMessage', { message, author });
  };

  const handleReply = () => {
    setReplyTo({
      messageId: message._id,
      channelId: message.channelId,
      authorUsername: author.username,
      preview: (message.content || '').replace(/\s+/g, ' ').slice(0, 80),
    });
  };

  const handleForward = () => {
    openModal('forwardMessage', { message });
  };

  const handleMoreActions = (e: MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (suppressNextMoreClickOpenRef.current) {
      suppressNextMoreClickOpenRef.current = false;
      return;
    }

    if (isContextMenuOpen) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }

    setShowEmojiPicker(false);

    const trigger = itemRef.current;
    if (!trigger) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const contextEvent = new window.MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.bottom,
    });
    trigger.dispatchEvent(contextEvent);
  };

  const handleMorePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (isContextMenuOpen && e.button === 0) {
      morePointerDownRef.current = true;
    }
  };

  const handleCopy = async () => {
    const text = getMessageBestEffortText(message);
    if (!text) {
      toast.error(t('message.copy.empty'));
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('message.copy.success'));
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      if (ok) toast.success(t('message.copy.success'));
      else toast.error(t('message.copy.failed'));
    }
  };

  const jpdictUserIdQuery = useQuery({
    queryKey: ['service-bot-user', 'jpdict-agent'],
    queryFn: async () => {
      try {
        const res = await infraApi.serviceBotUser('jpdict-agent');
        return (res.data?.botUserId as string | undefined) || '';
      } catch {
        return '';
      }
    },
    staleTime: 60_000,
    retry: false,
  });
  const jpdictUserId = jpdictUserIdQuery.data || '';
  const canSendToJpdict = !!jpdictUserId && onlineStatus[jpdictUserId] === 'online';

  const voice = isVoiceMessage ? message.payload?.voice : undefined;
  const voiceSrc = typeof voice?.url === 'string' ? voice.url : '';

  const handleSendToJpdict = async () => {
    if (!jpdictUserId) {
      toast.error(t('message.jpdict.notFound'));
      return;
    }
    if (onlineStatus[jpdictUserId] !== 'online') {
      toast.error(t('message.jpdict.offline'));
      return;
    }

    const selection = (menuSelection || getSelectionTextWithin(itemRef.current)).trim();
    const attachments = Array.isArray(message.attachments) ? (message.attachments as Attachment[]) : [];

    const payloadToSend: { content?: string; attachments?: Attachment[] } = {};

    if (selection) {
      payloadToSend.content = selection;
    } else if (attachments.length > 0) {
      payloadToSend.attachments = attachments;
      const caption = (message.content || '').trim();
      if (caption && !looksLikeIdPlaceholder(caption)) {
        payloadToSend.content = caption;
      }
    } else {
      const fallbackText = getMessageBestEffortText(message).trim();
      if (!fallbackText) {
        toast.error(t('message.jpdict.nothingToSend'));
        return;
      }
      payloadToSend.content = fallbackText;
    }

    try {
      const dmRes = await channelApi.createDM(jpdictUserId);
      const dmChannelId = dmRes.data?._id as string | undefined;
      if (!dmChannelId) {
        toast.error(t('message.jpdict.dmCreateFailed'));
        return;
      }

      await messageApi.send(undefined, dmChannelId, payloadToSend);
      await queryClient.invalidateQueries({ queryKey: ['dmChannels'] });
      setCurrentServer(null);
      setCurrentChannel(dmChannelId);
      toast.success(t('message.jpdict.sent'));
    } catch (err) {
      console.error('send to jpdict failed', err);
      toast.error(t('message.jpdict.sendFailed'));
    }
  };

  const handleSpeakText = async () => {
    const selection = (menuSelection || getSelectionTextWithin(itemRef.current)).trim();
    const text = (selection || getMessageBestEffortText(message)).trim();

    if (!text) {
      toast.error(t('message.tts.nothingToSpeak'));
      return;
    }

    const loadingToast = toast.loading(t('message.tts.generating'));
    try {
      const res = await ttsApi.synthesize(text, {
        model: voiceSettings.ttsModel,
        voice: voiceSettings.ttsVoice,
      });
      stopActiveTts();

      const blob = new Blob([res.data], { type: res.contentType || 'audio/mpeg' });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);

      activeTtsAudio = audio;
      activeTtsUrl = url;

      audio.onended = () => stopActiveTts();
      audio.onerror = () => stopActiveTts();

      await audio.play();
      toast.success(t('message.tts.playing'), { id: loadingToast });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('TTS failed', message, err);
      toast.error(t('message.tts.failed'), { id: loadingToast });
      stopActiveTts();
    }
  };

  const handleTranscribeVoice = async () => {
    if (!isVoiceMessage) return;
    if (!voiceSrc) {
      toast.error(t('message.voice.unavailable'));
      return;
    }

    // 1. 如果已经有文本，直接显示
    const existing = (typeof message.plainText === 'string' ? message.plainText : '').trim();
    if (existing) {
      setShowVoiceTranscript((prev) => !prev); // 改为 toggle 更符合用户直觉
      return;
    }
    
    // 2. 如果正在显示且没有文本（可能是上次失败了），或者未显示，则开始流程
    setShowVoiceTranscript(true);
    setVoiceTranscriptLoading(true);
    try {
      const resp = await fetch(voiceSrc);
      if (!resp.ok) {
        throw new Error(`Failed to fetch voice file: ${resp.status}`);
      }

      const blob = await resp.blob();
      const mimeType =
        (typeof blob.type === 'string' && blob.type) ||
        (typeof voice?.contentType === 'string' && voice.contentType) ||
        'audio/webm';

      const ext = mimeType.includes('ogg')
        ? 'ogg'
        : mimeType.includes('mpeg')
          ? 'mp3'
          : mimeType.includes('wav')
            ? 'wav'
            : mimeType.includes('mp4')
              ? 'm4a'
              : 'webm';

      const file = new File([blob], `voice-${message._id}.${ext}`, { type: mimeType });
      const text = await sttApi.transcribe(file, {
        model: voiceSettings.sttModel,
        response_format: 'json',
      });

      queryClient.setQueryData(['messages', message.channelId], (old: Message[] | undefined) => {
        if (!old) return old;
        return old.map((m) => (m._id === message._id ? { ...m, plainText: text } : m));
      });
    } catch (err) {
      console.error('STT failed', err);
      toast.error(t('message.voice.transcribeFailed'));
    } finally {
      setVoiceTranscriptLoading(false);
    }
  };

  const handleReactionClick = async (emoji: string) => {
      if (!user?._id) return;

      const existingReaction = message.reactions?.find(r => r.emoji === emoji);
      const hasReacted = existingReaction?.userIds.includes(user._id);

      try {
          const updateCache = (add: boolean) => {
              queryClient.setQueryData(['messages', message.channelId], (old: Message[] | undefined) => {
                  if (!old) return old;
                  return old.map(m => {
                      if (m._id !== message._id) return m;

                      const newReactions = m.reactions ? [...m.reactions] : [];
                      const targetIndex = newReactions.findIndex(r => r.emoji === emoji);

                      if (targetIndex > -1) {
                          const r = newReactions[targetIndex];
                          const newUserIds = add
                              ? [...r.userIds, user._id]
                              : r.userIds.filter(id => id !== user._id);

                          if (newUserIds.length === 0) {
                              newReactions.splice(targetIndex, 1);
                          } else {
                              newReactions[targetIndex] = { ...r, userIds: newUserIds };
                          }
                      } else if (add) {
                          newReactions.push({ emoji, userIds: [user._id] });
                      }

                      return { ...m, reactions: newReactions };
                  });
              });
          };

          if (hasReacted) {
              updateCache(false);
              await messageApi.removeReaction(currentServerId || undefined, message.channelId, message._id, emoji);
          } else {
              updateCache(true);
              await messageApi.addReaction(currentServerId || undefined, message.channelId, message._id, emoji);
          }
      } catch (error) {
          console.error("Failed to toggle reaction", error);
          await queryClient.invalidateQueries({ queryKey: ['messages', message.channelId] });
      }
  };

  const isValidDate = message.createdAt && !isNaN(new Date(message.createdAt).getTime());
  const timeString = isValidDate
    ? formatDateTime(new Date(message.createdAt), locale, { hour: 'numeric', minute: '2-digit' })
    : '';
  const fullDateString = isValidDate
    ? (() => {
        const date = new Date(message.createdAt);
        const relativeDay = getRelativeDay(date);
        if (relativeDay === 'today') return timeString;
        if (relativeDay === 'yesterday') return `${t('datetime.yesterday')} ${timeString}`;
        return formatDateTime(date, locale, { dateStyle: 'medium', timeStyle: 'short' });
      })()
    : '';
  const hoverActionButtonBaseClass =
    'group/action relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-[6px] text-[#b5bac1] transition-colors duration-100 hover:bg-[#3f4147] hover:text-[#dbdee1] focus-visible:outline-none active:translate-y-[0.5px]';
  const hoverActionIconClass =
    'transition-transform duration-100 ease-out group-hover/action:scale-110 group-focus-visible/action:scale-110';
  const hoverActionDangerClass =
    'group/action relative flex h-8 w-8 cursor-pointer items-center justify-center rounded-[6px] text-[#b5bac1] transition-colors duration-100 hover:bg-[#da373c] hover:text-white focus-visible:outline-none active:translate-y-[0.5px]';

  if (isEditing) {
      return <MessageEditor message={message} onCancel={() => setIsEditing(false)} />;
  }

  const ReplyPreview = () => {
    if (!message.referencedMessageId || isRetracted) return null;

    const refAuthor =
      referencedMessage && typeof referencedMessage.authorId === 'object'
        ? referencedMessage.authorId
        : null;

    const label = refAuthor?.username ? t('message.reply.toUser', { name: refAuthor.username }) : t('message.reply.generic');
    const snippet = referencedMessage?.content ? referencedMessage.content.replace(/\s+/g, ' ').slice(0, 90) : '';

    return (
      <button
        type="button"
        className="flex items-center gap-2 text-xs text-mew-textMuted hover:text-mew-text mb-1 max-w-full"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setTargetMessageId(message.referencedMessageId!);
        }}
        title={snippet || label}
      >
        <Icon icon="mdi:reply" width="14" />
        <span className="truncate">
          {label}
          {snippet ? `: ${snippet}` : ''}
        </span>
      </button>
    );
  };

  return (
    <ContextMenu.Root
      onOpenChange={(open) => {
        setIsContextMenuOpen(open);
        if (open) setMenuSelection(getSelectionTextWithin(itemRef.current));
        else {
          if (morePointerDownRef.current) {
            suppressNextMoreClickOpenRef.current = true;
          }
          morePointerDownRef.current = false;
          setMenuSelection('');
        }
      }}
    >
      <ContextMenu.Trigger asChild>
        <div
          ref={itemRef}
          id={`message-${message._id}`}
          onContextMenu={(e) => {
            setMenuSelection(getSelectionTextWithin(e.currentTarget));
          }}
          className={clsx(
            'group flex pr-4 relative transition-colors duration-200',
            isSequential ? 'py-0.5' : 'mt-[17px] py-0.5 mb-1',
            className,
            {
              'animate-mention-flash-anim': applyFlash,
              'bg-[#fde047]/25': jumpBlinkOn,
              'hover:bg-[#2e3035]': !isMentioned,
              'hover:bg-[#F0B232]/20': isMentioned,
            }
          )}
        >
          {/* Mention Highlight Border */}
          {isMentioned && (
            <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-[#F0B232] rounded-r-sm opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>
          )}

          {/* Hover Actions - Only show if NOT retracted */}
          {!isRetracted && (
            <div
              className={clsx(
                'absolute right-3 -top-3.5 z-10 flex select-none items-center rounded-[8px] border border-[#26272d] bg-[#2b2d31] p-[1px] shadow-sm transition-opacity',
                showEmojiPicker
                  ? 'opacity-100 pointer-events-auto'
                  : 'opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto'
              )}
            >
              {canAddReaction && (
                <div className="relative">
                  <button
                    type="button"
                    aria-label={t('message.menu.addReaction')}
                    className={clsx(
                      hoverActionButtonBaseClass,
                      'text-mew-textMuted hover:text-mew-text hover:bg-[#404249]'
                    )}
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  >
                    <Icon icon="mdi:emoticon-plus-outline" width="20" height="20" className={hoverActionIconClass} />
                    <ActionTooltip label={t('message.menu.addReaction')} />
                  </button>
                  {showEmojiPicker && (
                    <EmojiPicker
                      onSelect={(emoji) => handleReactionClick(emoji)}
                      onClose={() => setShowEmojiPicker(false)}
                    />
                  )}
                </div>
              )}

              {canSendMessages && (
                <button
                  type="button"
                  onClick={handleReply}
                  aria-label={t('message.menu.reply')}
                  className={clsx(
                    hoverActionButtonBaseClass
                  )}
                >
                  <Icon icon="mdi:reply" width="20" height="20" className={hoverActionIconClass} />
                  <ActionTooltip label={t('message.menu.reply')} />
                </button>
              )}

              {canSendMessages && (
                <button
                  type="button"
                  onClick={handleForward}
                  aria-label={t('message.menu.forward')}
                  className={clsx(
                    hoverActionButtonBaseClass
                  )}
                >
                  <span className={clsx(hoverActionIconClass, 'flex items-center justify-center')}>
                    <Icon icon="mdi:reply" width="20" height="20" style={{ transform: 'scaleX(-1)' }} />
                  </span>
                  <ActionTooltip label={t('message.menu.forward')} />
                </button>
              )}

              <button
                type="button"
                onPointerDown={handleMorePointerDown}
                onClick={handleMoreActions}
                aria-label={t('common.more')}
                className={hoverActionButtonBaseClass}
              >
                <Icon icon="mdi:dots-horizontal" width="20" height="20" className={hoverActionIconClass} />
                <ActionTooltip label={t('common.more')} />
              </button>

              {isAuthor && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  aria-label={t('common.edit')}
                  className={clsx(
                    hoverActionButtonBaseClass
                  )}
                >
                  <Icon icon="mdi:pencil" width="20" height="20" className={hoverActionIconClass} />
                  <ActionTooltip label={t('common.edit')} />
                </button>
              )}

              {(isAuthor || canManageMessages || canDeleteAsBotOwner) && (
                <button
                  type="button"
                  onClick={handleDelete}
                  aria-label={t('message.delete.title')}
                  className={hoverActionDangerClass}
                >
                  <Icon icon="mdi:trash-can-outline" width="20" height="20" className={hoverActionIconClass} />
                  <ActionTooltip label={t('message.delete.title')} />
                </button>
              )}
            </div>
          )}

          {isSequential ? (
            <>
              <div className="w-[72px] text-[10px] leading-[1.375rem] text-mew-textMuted opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-right pr-4 select-none flex-shrink-0">
                {timeString}
              </div>
              <div className="flex-1 min-w-0">
                {isRetracted ? (
                  <div className="text-mew-textMuted italic text-[0.95rem] leading-[1.375rem] select-none">
                    {t('message.deleted')}
                  </div>
                ) : (
                  <>
                    <ReplyPreview />
                    <MessageContent
                      message={message}
                      serverId={currentServerId || undefined}
                      channelId={message.channelId}
                    />
                    {message.editedAt && (
                      <span className="text-[10px] text-mew-textMuted ml-1 select-none">{t('message.edited')}</span>
                    )}
                    <ReactionList
                      reactions={message.reactions}
                      currentUserId={user?._id}
                      onReactionClick={handleReactionClick}
                    />
                  </>
                )}
              </div>
            </>
          ) : (
            <>
              <div
                className="pl-4 mt-0.5 mr-4 flex-shrink-0 cursor-pointer"
                onClick={() => openModal('userProfile', { user: author })}
              >
                {author.avatarUrl ? (
                  <img
                    src={author.avatarUrl}
                    alt={author.username}
                    className="w-10 h-10 rounded-full object-cover hover:opacity-80 transition-opacity"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-mew-accent flex items-center justify-center text-white font-semibold">
                    {author.username.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center">
                  <div
                    className="font-medium text-white mr-2 hover:underline cursor-pointer"
                    onClick={() => openModal('userProfile', { user: author })}
                  >
                    {author.isBot && message.payload?.webhookName && author.username !== message.payload.webhookName ? (
                      <>
                        <span className="font-medium text-white">{author.username}</span>
                        <span className="text-sm text-mew-textMuted ml-1.5">@ {message.payload.webhookName}</span>
                      </>
                    ) : (
                      <span>{author.username}</span>
                    )}
                  </div>
                  {author.isBot && (
                    <span className="bg-[#5865F2] text-white text-[10px] font-bold px-1 rounded-[3px] leading-3 shrink-0">
                      {message.payload?.webhookName ? t('message.bot.hook') : t('message.bot.bot')}
                    </span>
                  )}
                  <span className="text-xs text-mew-textMuted ml-2">{fullDateString}</span>
                </div>

                {isRetracted ? (
                  <div className="text-mew-textMuted italic text-[0.95rem] leading-[1.375rem] select-none mt-1">
                    {t('message.deleted')}
                  </div>
                ) : (
                  <>
                    <ReplyPreview />
                    <div className={clsx('text-mew-text text-[0.95rem] leading-[1.375rem]', isAppCard ? 'mt-1' : '')}>
                      <MessageContent
                        message={message}
                        serverId={currentServerId || undefined}
                        channelId={message.channelId}
                        showVoiceTranscript={isVoiceMessage && showVoiceTranscript}
                        voiceTranscriptLoading={isVoiceMessage && showVoiceTranscript && voiceTranscriptLoading}
                      />
                      {message.editedAt && (
                        <span className="text-[10px] text-mew-textMuted ml-1 select-none">{t('message.edited')}</span>
                      )}
                    </div>
                    <ReactionList
                      reactions={message.reactions}
                      currentUserId={user?._id}
                      onReactionClick={handleReactionClick}
                    />
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </ContextMenu.Trigger>

      <MessageContextMenu
        canAddReaction={canAddReaction}
        canReply={canSendMessages}
        canForward={canSendMessages}
        canCopy={true}
        canDelete={isAuthor || canManageMessages || canDeleteAsBotOwner}
        canSendToJpdict={canSendToJpdict}
        canTranscribeVoice={isVoiceMessage}
        isRetracted={isRetracted}
        onAddReaction={handleReactionClick}
        onReply={handleReply}
        onForward={handleForward}
        onCopy={handleCopy}
        onAddApp={() => {}}
        onSpeak={handleSpeakText}
        onSendToJpdict={handleSendToJpdict}
        onTranscribeVoice={handleTranscribeVoice}
        onDelete={() => openModal('deleteMessage', { message, author })}
      />
    </ContextMenu.Root>
  );
};

export default MessageItem;

