import React, { useState } from 'react';
import { Message } from '../types';
import { format } from 'date-fns';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { useAuthStore, useUIStore } from '../store';
import { messageApi } from '../services/api';
import { useQueryClient } from '@tanstack/react-query';

interface MessageItemProps {
  message: Message;
  isSequential?: boolean;
}

const MessageItem: React.FC<MessageItemProps> = ({ message, isSequential }) => {
  const { user } = useAuthStore();
  const { currentServerId } = useUIStore();
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isDeleting, setIsDeleting] = useState(false);

  const author = typeof message.authorId === 'object' ? message.authorId : { username: 'Unknown', avatarUrl: '', _id: message.authorId as string, isBot: false };
  const isRssCard = message.type === 'app/x-rss-card';
  // Ensure ID comparison is safe (convert to string)
  const isAuthor = user?._id?.toString() === author._id?.toString();

  const handleEdit = async (e?: React.FormEvent) => {
      e?.preventDefault();
      e?.stopPropagation(); // Prevent bubbling
      if (!editContent.trim() || editContent === message.content) {
          setIsEditing(false);
          return;
      }

      try {
          await messageApi.update(currentServerId || undefined, message.channelId, message._id, editContent);
          // Optimistic update
          queryClient.setQueryData(['messages', message.channelId], (old: Message[] | undefined) => {
              if (!old) return old;
              return old.map(m => m._id === message._id ? { ...m, content: editContent, editedAt: new Date().toISOString() } : m);
          });
          setIsEditing(false);
      } catch (error) {
          console.error("Failed to edit message", error);
      }
  };

  const handleDelete = async (e: React.MouseEvent) => {
      // 1. Stop propagation and prevent default to ensure click is captured correctly
      e.preventDefault();
      e.stopPropagation();

      // 2. Confirmation
      if (!window.confirm("Are you sure you want to delete this message?")) return;
      
      setIsDeleting(true);
      try {
          // 3. API Call
          await messageApi.delete(currentServerId || undefined, message.channelId, message._id);
          
          // 4. Optimistic Update
          queryClient.setQueryData(['messages', message.channelId], (old: Message[] | undefined) => {
             if (!old) return old;
             return old.filter(m => m._id !== message._id);
          });
      } catch (error: any) {
          console.error("Failed to delete message", error);
          setIsDeleting(false);
          // 5. Error feedback
          alert(`Failed to delete: ${error.response?.data?.message || 'Unknown error'}`);
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          handleEdit();
      } else if (e.key === 'Escape') {
          setIsEditing(false);
          setEditContent(message.content);
      }
  };

  // Render Edit Form
  if (isEditing) {
      return (
          <div className="py-0.5 px-4 bg-[#2e3035]/50 flex pr-4 mt-[17px]">
              <div className="w-10 h-10 rounded-full bg-mew-accent flex items-center justify-center text-white font-semibold mr-4 mt-0.5 opacity-50">
                  {author.username.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 w-full">
                  <div className="flex items-center mb-1">
                      <span className="font-medium text-white mr-2">{author.username}</span>
                      <span className="text-xs text-mew-textMuted">{format(new Date(message.createdAt), 'MM/dd/yyyy h:mm a')}</span>
                  </div>
                  <div className="bg-[#383A40] rounded p-2">
                      <textarea 
                          className="w-full bg-transparent text-mew-text focus:outline-none resize-none"
                          rows={Math.max(2, editContent.split('\n').length)}
                          value={editContent}
                          onChange={(e) => setEditContent(e.target.value)}
                          onKeyDown={handleKeyDown}
                          autoFocus
                      />
                  </div>
                  <div className="text-xs mt-2 space-x-2">
                      <span className="text-mew-textMuted">escape to <span onClick={() => setIsEditing(false)} className="text-mew-accent hover:underline cursor-pointer">cancel</span></span>
                      <span className="text-mew-textMuted">•</span>
                      <span className="text-mew-textMuted">enter to <span onClick={() => handleEdit()} className="text-mew-accent hover:underline cursor-pointer">save</span></span>
                  </div>
              </div>
          </div>
      )
  }

  return (
    <div className={clsx("group flex pr-4 hover:bg-[#2e3035] relative", isSequential ? "py-0.5" : "mt-[17px] py-0.5 mb-1")}>
      
      {/* Hover Actions */}
      <div className="absolute right-4 -top-2 bg-[#313338] border border-[#26272D] rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity flex items-center p-1 z-10">
         <button type="button" className="p-1 hover:bg-[#404249] rounded text-mew-textMuted hover:text-mew-text" title="Add Reaction">
            <Icon icon="mdi:emoticon-plus-outline" width="18" height="18" />
         </button>
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
                 {renderContent(message, isRssCard)}
                 {message.editedAt && <span className="text-[10px] text-mew-textMuted ml-1 select-none">(edited)</span>}
            </div>
         </>
      ) : (
          <>
            <div className="pl-4 mt-0.5 mr-4 flex-shrink-0 cursor-pointer">
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
                    <span className="font-medium text-white mr-2 hover:underline cursor-pointer">{author.username}</span>
                    {author.isBot && (
                        <span className="bg-[#5865F2] text-white text-[10px] px-1.5 rounded-[3px] h-[15px] flex items-center mr-2 uppercase font-bold">Bot</span>
                    )}
                    <span className="text-xs text-mew-textMuted ml-1">{format(new Date(message.createdAt), 'MM/dd/yyyy h:mm a')}</span>
                </div>
                <div className={clsx("text-mew-text text-[0.95rem] leading-[1.375rem]", isRssCard ? "mt-1" : "")}>
                    {renderContent(message, isRssCard)}
                    {message.editedAt && <span className="text-[10px] text-mew-textMuted ml-1 select-none">(edited)</span>}
                </div>
            </div>
          </>
      )}
    </div>
  );
};

const renderContent = (message: Message, isRssCard: boolean) => {
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
        )
    }
    return <p className="whitespace-pre-wrap break-words">{message.content}</p>;
}

export default MessageItem;