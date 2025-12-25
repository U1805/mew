import { useState, useEffect, useRef, type MouseEvent } from 'react';
import { format } from 'date-fns';
import { Icon } from '@iconify/react';
import * as ContextMenu from '@radix-ui/react-context-menu';
import clsx from 'clsx';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { EmojiPicker } from './EmojiPicker';
import { MessageContextMenu } from './MessageContextMenu';
import ReactionList from './ReactionList';
import MessageContent from './MessageContent';
import MessageEditor from './MessageEditor';
import { Message } from '../../../shared/types';
import { messageApi } from '../../../shared/services/api';
import { useAuthStore, useUIStore, useModalStore, useUnreadStore } from '../../../shared/stores';
import { usePermissions } from '../../../shared/hooks/usePermissions';

interface MessageItemProps {
  message: Message;
  isSequential?: boolean;
}

const MessageItem = ({ message, isSequential }: MessageItemProps) => {
  const { user } = useAuthStore();
  const { currentServerId, setReplyTo, setTargetMessageId } = useUIStore();
  const { openModal } = useModalStore();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [applyFlash, setApplyFlash] = useState(false);
  const permissions = usePermissions(message.channelId);
  const { unreadMentionMessageIds, removeUnreadMention } = useUnreadStore();
  const itemRef = useRef<HTMLDivElement>(null);

  const canAddReaction = permissions.has('ADD_REACTIONS');
  const canManageMessages = permissions.has('MANAGE_MESSAGES');
  const canSendMessages = permissions.has('SEND_MESSAGES');

  const author = typeof message.authorId === 'object' ? message.authorId : { username: 'Unknown', avatarUrl: '', _id: message.authorId as string, isBot: false, createdAt: new Date().toISOString(), email: '' };
  const isRssCard = message.type === 'app/x-rss-card';
  const isPornhubCard = message.type === 'app/x-pornhub-card';
  const isTwitterCard = message.type === 'app/x-twitter-card';
  const isBilibiliCard = message.type === 'app/x-bilibili-card';
  const isInstagramCard = message.type === 'app/x-instagram-card';
  const isForwardCard = message.type === 'app/x-forward-card';
  const isAppCard = isRssCard || isPornhubCard || isTwitterCard || isBilibiliCard || isInstagramCard || isForwardCard;
  const isAuthor = user?._id?.toString() === author._id?.toString();
  const isRetracted = !!message.retractedAt;
  const referencedMessage = message.referencedMessageId
    ? (queryClient.getQueryData<Message[]>(['messages', message.channelId]) || []).find(
        (m) => m._id === message.referencedMessageId
      )
    : undefined;

  const isMentioned = user && (
    (Array.isArray(message.mentions) && message.mentions.includes(user._id)) ||
    message.content.includes('@everyone') ||
    message.content.includes('@here')
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

  const handleCopy = async () => {
    const payloadForwarded = (message.payload as any)?.forwardedMessage;
    const candidate =
      typeof message.content === 'string' && message.content.trim()
        ? message.content
        : typeof payloadForwarded?.content === 'string' && payloadForwarded.content.trim()
          ? payloadForwarded.content
          : typeof (message.payload as any)?.url === 'string'
            ? (message.payload as any).url
            : '';

    const text = candidate || '';
    if (!text) {
      toast.error('Nothing to copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
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
      if (ok) toast.success('Copied');
      else toast.error('Copy failed');
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
  const timeString = isValidDate ? format(new Date(message.createdAt), 'h:mm a') : '';
  const fullDateString = isValidDate ? format(new Date(message.createdAt), 'MM/dd/yyyy h:mm a') : '';

  if (isEditing) {
      return <MessageEditor message={message} onCancel={() => setIsEditing(false)} />;
  }

  const ReplyPreview = () => {
    if (!message.referencedMessageId || isRetracted) return null;

    const refAuthor =
      referencedMessage && typeof referencedMessage.authorId === 'object'
        ? referencedMessage.authorId
        : null;

    const label = refAuthor?.username ? `回复 ${refAuthor.username}` : '回复一条消息';
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
          {snippet ? `：${snippet}` : ''}
        </span>
      </button>
    );
  };

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          ref={itemRef}
          id={`message-${message._id}`}
          className={clsx(
            'group flex pr-4 relative transition-colors duration-200',
            isSequential ? 'py-0.5' : 'mt-[17px] py-0.5 mb-1',
            {
              'animate-mention-flash-anim': applyFlash,
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
            <div className="absolute right-4 -top-2 bg-[#313338] border border-[#26272D] rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center p-1 z-10">
              {canAddReaction && (
                <div className="relative">
                  <button
                    type="button"
                    className="p-1 hover:bg-[#404249] rounded text-mew-textMuted hover:text-mew-text"
                    title="Add Reaction"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  >
                    <Icon icon="mdi:emoticon-plus-outline" width="18" height="18" />
                  </button>
                  {showEmojiPicker && (
                    <EmojiPicker
                      onSelect={(emoji) => handleReactionClick(emoji)}
                      onClose={() => setShowEmojiPicker(false)}
                    />
                  )}
                </div>
              )}

              {isAuthor && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="p-1 hover:bg-[#404249] rounded text-mew-textMuted hover:text-mew-text"
                  title="Edit"
                >
                  <Icon icon="mdi:pencil" width="18" height="18" />
                </button>
              )}

              {(isAuthor || canManageMessages) && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="p-1 hover:bg-[#404249] rounded text-red-400 hover:text-red-500"
                  title="Delete"
                >
                  <Icon icon="mdi:trash-can-outline" width="18" height="18" />
                </button>
              )}
            </div>
          )}

          {isSequential ? (
            <>
              <div className="w-[50px] text-[10px] text-mew-textMuted opacity-0 group-hover:opacity-100 text-right pr-3 select-none mt-1.5 flex-shrink-0">
                {timeString}
              </div>
              <div className="flex-1 min-w-0 pl-4">
                {isRetracted ? (
                  <div className="text-mew-textMuted italic text-[0.95rem] leading-[1.375rem] select-none">
                    (message deleted)
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
                      <span className="text-[10px] text-mew-textMuted ml-1 select-none">(edited)</span>
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
                      {message.payload?.webhookName ? 'HOOK' : 'BOT'}
                    </span>
                  )}
                  <span className="text-xs text-mew-textMuted ml-2">{fullDateString}</span>
                </div>

                {isRetracted ? (
                  <div className="text-mew-textMuted italic text-[0.95rem] leading-[1.375rem] select-none mt-1">
                    (message deleted)
                  </div>
                ) : (
                  <>
                    <ReplyPreview />
                    <div className={clsx('text-mew-text text-[0.95rem] leading-[1.375rem]', isAppCard ? 'mt-1' : '')}>
                      <MessageContent
                        message={message}
                        serverId={currentServerId || undefined}
                        channelId={message.channelId}
                      />
                      {message.editedAt && (
                        <span className="text-[10px] text-mew-textMuted ml-1 select-none">(edited)</span>
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
        canDelete={isAuthor || canManageMessages}
        isRetracted={isRetracted}
        onAddReaction={handleReactionClick}
        onReply={handleReply}
        onForward={handleForward}
        onCopy={handleCopy}
        onAddApp={() => {}}
        onDelete={() => openModal('deleteMessage', { message, author })}
      />
    </ContextMenu.Root>
  );
};

export default MessageItem;
