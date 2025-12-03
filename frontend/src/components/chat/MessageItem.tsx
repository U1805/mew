
import React, { useState } from 'react';
import { Message } from '../../types';
import { format } from 'date-fns';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { useAuthStore, useUIStore, useModalStore } from '../../store';
import { messageApi } from '../../services/api';
import { useQueryClient } from '@tanstack/react-query';
import { EmojiPicker } from './EmojiPicker';
import ReactionList from './ReactionList';
import MessageContent from './MessageContent';
import MessageEditor from './MessageEditor';

interface MessageItemProps {
  message: Message;
  isSequential?: boolean;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, isSequential }) => {
  const { user } = useAuthStore();
  const { currentServerId } = useUIStore();
  const { openModal } = useModalStore();
  const queryClient = useQueryClient();

  const [isEditing, setIsEditing] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const author = typeof message.authorId === 'object' ? message.authorId : { username: 'Unknown', avatarUrl: '', _id: message.authorId as string, isBot: false, createdAt: new Date().toISOString(), email: '' };
  const isRssCard = message.type === 'app/x-rss-card';
  const isAuthor = user?._id?.toString() === author._id?.toString();

  const handleDelete = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openModal('deleteMessage', { message, author });
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

                      let newReactions = m.reactions ? [...m.reactions] : [];
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

  if (isEditing) {
      return <MessageEditor message={message} onCancel={() => setIsEditing(false)} />;
  }

  return (
    <div className={clsx("group flex pr-4 hover:bg-[#2e3035] relative", isSequential ? "py-0.5" : "mt-[17px] py-0.5 mb-1")}>

      {/* Hover Actions */}
      <div className="absolute right-4 -top-2 bg-[#313338] border border-[#26272D] rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center p-1 z-10">
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

         {isAuthor && (
             <>
                <button type="button" onClick={() => setIsEditing(true)} className="p-1 hover:bg-[#404249] rounded text-mew-textMuted hover:text-mew-text" title="Edit">
                    <Icon icon="mdi:pencil" width="18" height="18" />
                </button>
                <button
                    type="button"
                    onClick={handleDelete}
                    className="p-1 hover:bg-[#404249] rounded text-red-400 hover:text-red-500"
                    title="Delete"
                >
                    <Icon icon="mdi:trash-can-outline" width="18" height="18" />
                </button>
             </>
         )}
      </div>

      {isSequential ? (
         <>
            <div className="w-[50px] text-[10px] text-mew-textMuted opacity-0 group-hover:opacity-100 text-right pr-3 select-none mt-1.5 flex-shrink-0">
                {format(new Date(message.createdAt), 'h:mm a')}
            </div>
            <div className="flex-1 min-w-0 pl-4">
                 <MessageContent message={message} />
                 {message.editedAt && <span className="text-[10px] text-mew-textMuted ml-1 select-none">(edited)</span>}
                 <ReactionList reactions={message.reactions} currentUserId={user?._id} onReactionClick={handleReactionClick} />
            </div>
         </>
      ) : (
          <>
            <div
                className="pl-4 mt-0.5 mr-4 flex-shrink-0 cursor-pointer"
                onClick={() => openModal('userProfile', { user: author })}
            >
                {author.avatarUrl ? (
                <img src={author.avatarUrl} alt={author.username} className="w-10 h-10 rounded-full hover:opacity-80 transition-opacity" />
                ) : (
                <div className="w-10 h-10 rounded-full bg-mew-accent flex items-center justify-center text-white font-semibold">
                    {author.username.slice(0, 2).toUpperCase()}
                </div>
                )}
            </div>
            <div className="flex-1 min-w-0">
                <div className="flex items-center">
                    <span
                        className="font-medium text-white mr-2 hover:underline cursor-pointer"
                        onClick={() => openModal('userProfile', { user: author })}
                    >
                        {author.username}
                    </span>
                    {author.isBot && (
                        <span className="bg-[#5865F2] text-white text-[10px] px-1.5 rounded-[3px] h-[15px] flex items-center mr-2 uppercase font-bold">Bot</span>
                    )}
                    <span className="text-xs text-mew-textMuted ml-1">{format(new Date(message.createdAt), 'MM/dd/yyyy h:mm a')}</span>
                </div>
                <div className={clsx("text-mew-text text-[0.95rem] leading-[1.375rem]", isRssCard ? "mt-1" : "")}>
                    <MessageContent message={message} />
                    {message.editedAt && <span className="text-[10px] text-mew-textMuted ml-1 select-none">(edited)</span>}
                </div>
                <ReactionList reactions={message.reactions} currentUserId={user?._id} onReactionClick={handleReactionClick} />
            </div>
          </>
      )}
    </div>
  );
};

export default MessageItem;
