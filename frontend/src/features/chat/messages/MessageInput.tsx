
import React, { useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import { messageApi, uploadApi } from '../../../shared/services/api';
import { Channel, Message, ServerMember, Attachment } from '../../../shared/types';
import { useAuthStore } from '../../../shared/stores/store';
import { MentionSuggestionList } from './MentionSuggestionList';
import { formatFileSize } from '../../../shared/utils/file';

interface MessageInputProps {
  channel: Channel | null;
  serverId: string | null;
  channelId: string | null;
}

const MessageInput: React.FC<MessageInputProps> = ({ channel, serverId, channelId }) => {
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<Array<Partial<Attachment & { isUploading?: boolean; progress?: number; file?: File; localUrl?: string; error?: string; key?: string }>>>([]);
  const isUploading = attachments.some(a => a.isUploading);
  const [mentionQuery, setMentionQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [committedMentions, setCommittedMentions] = useState<Map<string, string>>(new Map());

  const queryClient = useQueryClient();
  const canSendMessage = channel?.permissions?.includes('SEND_MESSAGES') ?? false;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !channelId) return;

    const files = Array.from(e.target.files);

    const newUploads = files.map(file => ({
      filename: file.name,
      contentType: file.type,
      size: file.size,
      localUrl: URL.createObjectURL(file),
      isUploading: true,
      progress: 0,
      file: file,
    }));

    setAttachments(prev => [...prev, ...newUploads]);

    // Start uploading each file
    newUploads.forEach((upload, index) => {
      uploadFile(upload, attachments.length + index);
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadFile = async (attachment: Partial<Attachment & { file: File }>, index: number) => {
    if (!attachment.file || !channelId) return;

    try {
            const formData = new FormData();
      formData.append('file', attachment.file);

      const response = await uploadApi.uploadFile(channelId, formData, (progressEvent) => {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        setAttachments(prev => {
          const newAttachments = [...prev];
          if (newAttachments[index]) {
            newAttachments[index].progress = progress;
          }
          return newAttachments;
        });
      });

      // Once uploaded, update the attachment with the real URL from S3
      setAttachments(prev => {
        const newAttachments = [...prev];
        if (newAttachments[index]) {
          newAttachments[index].isUploading = false;
          newAttachments[index].key = response.data.key; // [修正] 存储 key 而不是 url
          // The URL for preview is the local one, which is faster and doesn't depend on remote state.
          // The final, persistent URL will be hydrated by the backend upon message creation/retrieval.
          newAttachments[index].progress = 100;
        }
        return newAttachments;
      });

    } catch (error) {
      console.error('File upload failed:', error);
      // Handle error, e.g., show an error state on the attachment preview
      setAttachments(prev => {
          const newAttachments = [...prev];
          if (newAttachments[index]) {
            newAttachments[index].isUploading = false;
            newAttachments[index].error = 'Upload Failed';
          }
          return newAttachments;
      });
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

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
    if ((!inputValue.trim() && attachments.length === 0) || !channelId || isUploading) return;

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
      attachments: attachments.map(a => ({
          filename: a.filename || '',
          contentType: a.contentType || '',
          url: a.localUrl || '',
          size: a.size || 0
      })), // Include attachments in optimistic update
    };

    queryClient.setQueryData(['messages', channelId], (oldData: Message[] | undefined) => {
      return oldData ? [...oldData, newMessage] : [newMessage];
    });

    setInputValue('');
    setAttachments([]);
    setShowSuggestions(false);
    setCommittedMentions(new Map());

    try {
      const finalAttachments = attachments
        .filter(a => !a.isUploading && a.key) // [修正] 确保我们只发送已上传并拥有 key 的附件
        .map(({ filename, contentType, key, size }) => ({ filename, contentType, key, size } as unknown as Attachment));

      console.log('Sending attachments:', finalAttachments);

      await messageApi.send(currentServerId, channelId, {
        content: contentToSend,
        attachments: finalAttachments
      });
      await queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
    } catch (err) {
      queryClient.setQueryData(['messages', channelId], (oldData: Message[] | undefined) => {
        return oldData ? oldData.filter(m => m._id !== tempId) : [];
      });
      console.error("Failed to send message:", err);
      // Restore state on failure
      setInputValue(inputValue);
      setAttachments(attachments);
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

      {/* Upload Preview */}
      {attachments.length > 0 && (
        <div className="flex gap-4 p-3 bg-[#2B2D31] rounded-t-lg border-b border-[#1E1F22] overflow-x-auto custom-scrollbar">
          {attachments.map((file, index) => {
            const isImage = file.contentType?.startsWith('image/');
            return (
              <div key={index} className="relative group flex-shrink-0 w-36 h-36 bg-[#1E1F22] rounded-md flex flex-col items-center justify-center text-center p-2 overflow-hidden border border-[#383A40]">
                {isImage ? (
                  <img src={file.localUrl} alt={file.filename} className="absolute inset-0 w-full h-full object-cover rounded-md" />
                ) : (
                  <>
                    <Icon icon="mdi:file-document-outline" width="40" height="40" className="text-mew-text-muted mb-2" />
                    <span className="text-xs text-mew-text leading-tight break-all z-10 px-1">{file.filename}</span>
                  </>
                )}

                {/* Overlay for upload progress and status */}
                {file.isUploading && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                    <div className="w-12 h-12 border-4 border-t-transparent border-mew-accent rounded-full animate-spin"></div>
                    <span className="text-white text-sm mt-2 font-semibold">{file.progress}%</span>
                  </div>
                )}

                {/* Remove Button */}
                {!file.isUploading && (
                  <button
                    onClick={() => removeAttachment(index)}
                    className="absolute top-1 right-1 bg-black/50 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity z-20"
                    aria-label="remove attachment"
                  >
                    <Icon icon="mdi:close" width="18" height="18" />
                  </button>
                )}

                <div className="absolute bottom-1 left-1 right-1 bg-black/50 text-white text-xs px-1.5 py-0.5 rounded-sm truncate z-10">
                  {formatFileSize(file.size!)}
                </div>
                 {file.error && <div className='absolute bottom-0 left-0 right-0 bg-red-500 text-white text-xs text-center p-1'>Upload Failed</div>}
              </div>
            );
          })}
        </div>
      )}

      <form 
        onSubmit={handleSendMessage} 
        className={attachments.length > 0 ? "bg-[#383A40] rounded-b-lg p-2.5 flex items-center relative z-10" : "bg-[#383A40] rounded-lg p-2.5 flex items-center relative z-10"}
      >
        <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            multiple
            className="hidden"
            data-testid="file-input"
        />
        <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="text-mew-textMuted hover:text-mew-text p-1 mr-2 rounded-full hover:bg-mew-darker"
            disabled={!canSendMessage || isUploading}
            aria-label="add attachment"
        >
          <Icon icon="mdi:plus-circle" width="24" height="24" />
        </button>
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleChange}
          placeholder={isUploading ? 'Uploading files...' : (canSendMessage ? `Message #${channel?.name || 'channel'}` : 'You do not have permission to send messages in this channel')}
          className="bg-transparent flex-1 text-mew-text placeholder-mew-textMuted focus:outline-none disabled:cursor-not-allowed"
          disabled={!canSendMessage || isUploading}
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
