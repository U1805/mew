import React, { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import { messageApi } from '../../../shared/services/api';
import { Channel, Message, ServerMember } from '../../../shared/types';
import { useAuthStore } from '../../../shared/stores/store';
import { MentionSuggestionList } from './MentionSuggestionList';

interface MessageInputProps {
  channel: Channel | null;
  serverId: string | null;
  channelId: string | null;
}

const MessageInput: React.FC<MessageInputProps> = ({ channel, serverId, channelId }) => {
  const [inputValue, setInputValue] = useState('');
  const [mentionQuery, setMentionQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [committedMentions, setCommittedMentions] = useState<Map<string, string>>(new Map());

  const queryClient = useQueryClient();
  const canSendMessage = channel?.permissions?.includes('SEND_MESSAGES') ?? false;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setInputValue(val);

    setCommittedMentions(prevMap => {
        const newMap = new Map(prevMap);
        let updated = false;
        for (const username of newMap.keys()) {
            const mentionRegex = new RegExp(`@${username}\\b`);
            if (!mentionRegex.test(val)) {
                newMap.delete(username);
                updated = true;
            }
        }
        return updated ? newMap : prevMap;
    });

    if (serverId) {
        const cursor = e.target.selectionStart || 0;
        const textBefore = val.slice(0, cursor);
        const match = textBefore.match(/@([\w]*)$/);

        if (match) {
            setMentionQuery(match[1]);
            setShowSuggestions(true);
        } else {
            setShowSuggestions(false);
        }
    }
  };

  const handleMentionSelect = (member: ServerMember) => {
    const isGlobal = (member as any).isGlobal;
    const username = member.userId.username;

    // Do not add global mentions to the commit map. They don't need translation.
    if (!isGlobal && member.userId) {
      setCommittedMentions(prevMap => new Map(prevMap).set(username, member.userId._id));
    }

    const cursor = inputRef.current?.selectionStart || 0;
    const textBefore = inputValue.slice(0, cursor);
    const textAfter = inputValue.slice(cursor);

    const lastAtIndex = textBefore.lastIndexOf('@');
    if (lastAtIndex === -1) return;

    // For both global and user mentions, we insert the plain username.
    const newTextBefore = textBefore.slice(0, lastAtIndex) + `@${username}` + ' ';
    const newValue = newTextBefore + textAfter;

    setInputValue(newValue);
    setShowSuggestions(false);

    setTimeout(() => {
        if(inputRef.current) {
            inputRef.current.focus();
            inputRef.current.setSelectionRange(newTextBefore.length, newTextBefore.length);
        }
    }, 0);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || !channelId) return;

    let contentToSend = inputValue;
    const mentionsToSend: string[] = [];
    committedMentions.forEach((userId, username) => {
        const regex = new RegExp(`@${username}\\b`, 'g');
        if (regex.test(contentToSend)) {
             contentToSend = contentToSend.replace(regex, `<@${userId}>`);
             if (!mentionsToSend.includes(userId)) {
                mentionsToSend.push(userId);
             }
        }
    });

    const currentServerId = serverId ? serverId : undefined;

    const tempId = new Date().toISOString();
    const user = useAuthStore.getState().user;

    if (!user) return;

    const newMessage: Message = {
      _id: tempId,
      channelId: channelId,
      authorId: user,
      content: contentToSend, // Use the processed content
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: 'DEFAULT',
      mentions: mentionsToSend,
    };

    queryClient.setQueryData(['messages', channelId], (oldData: Message[] | undefined) => {
      return oldData ? [...oldData, newMessage] : [newMessage];
    });

    setInputValue('');
    setShowSuggestions(false);
    setCommittedMentions(new Map());

    try {
      await messageApi.send(currentServerId, channelId, { content: contentToSend });
      await queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
    } catch (err) {
      queryClient.setQueryData(['messages', channelId], (oldData: Message[] | undefined) => {
        return oldData ? oldData.filter(m => m._id !== tempId) : [];
      });
      console.error("Failed to send message:", err);
      setInputValue(inputValue);
    }
  };

  return (
    <div className="px-4 pb-6 pt-2 flex-shrink-0 relative">
      {showSuggestions && serverId && (
          <MentionSuggestionList
             serverId={serverId}
             query={mentionQuery}
             onSelect={handleMentionSelect}
             onClose={() => setShowSuggestions(false)}
          />
      )}

      <form onSubmit={handleSendMessage} className="bg-[#383A40] rounded-lg p-2.5 flex items-center relative z-10">
        <button type="button" className="text-mew-textMuted hover:text-mew-text p-1 mr-2 rounded-full hover:bg-mew-darker">
          <Icon icon="mdi:plus-circle" width="24" height="24" />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleChange}
          placeholder={canSendMessage ? `Message #${channel?.name || 'channel'}` : 'You do not have permission to send messages in this channel'}
          className="bg-transparent flex-1 text-mew-text placeholder-mew-textMuted focus:outline-none disabled:cursor-not-allowed"
          disabled={!canSendMessage}
          autoComplete="off"
        />
        <div className="flex items-center space-x-2 mr-2">
          <button type="button" className="text-mew-textMuted hover:text-mew-text"><Icon icon="mdi:gift" width="24" height="24" /></button>
          <button type="button" className="text-mew-textMuted hover:text-mew-text"><Icon icon="mdi:sticker-emoji" width="24" height="24" /></button>
          <button type="button" className="text-mew-textMuted hover:text-mew-text"><Icon icon="mdi:emoticon-happy" width="24" height="24" /></button>
        </div>
      </form>
    </div>
  );
};

export default MessageInput;