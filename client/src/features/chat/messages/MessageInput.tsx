import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import { messageApi, uploadApi } from '../../../shared/services/api';
import { Channel, Message, Attachment } from '../../../shared/types';
import { useAuthStore, useUIStore } from '../../../shared/stores';
import { formatFileSize } from '../../../shared/utils/file';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { createMentionSuggestion } from '../editor/mentionSuggestion';
import {
  extractMentionIdsFromDoc,
  parseContentStringToTiptapDoc,
  serializeTiptapDocToContentString,
} from '../editor/chatContent';

interface MessageInputProps {
  channel: Channel | null;
  serverId: string | null;
  channelId: string | null;
}

const MessageInput = ({ channel, serverId, channelId }: MessageInputProps) => {
  const [attachments, setAttachments] = useState<Array<Partial<Attachment & { isUploading?: boolean; progress?: number; file?: File; localUrl?: string; error?: string; key?: string }>>>([]);
  const isUploading = attachments.some(a => a.isUploading);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const placeholderRef = useRef('');
  const sendMessageRef = useRef<() => void>(() => {});

  const queryClient = useQueryClient();
  const { replyTo, clearReplyTo, setReplyTo } = useUIStore();
  const canSendMessage = channel?.permissions?.includes('SEND_MESSAGES') ?? false;

  const activeReplyTo = useMemo(() => {
    if (!replyTo || !channelId) return null;
    return replyTo.channelId === channelId ? replyTo : null;
  }, [replyTo, channelId]);

  const placeholderText = useMemo(() => {
    if (isUploading) return 'Uploading files...';
    if (!canSendMessage) return 'You do not have permission to send messages in this channel';
    return `Message #${channel?.name || 'channel'}`;
  }, [canSendMessage, channel?.name, isUploading]);

  placeholderRef.current = placeholderText;

  const mentionExtension = useMemo(() => {
    if (!serverId) return null;

    return Mention.configure({
      HTMLAttributes: {
        class:
          'inline-flex items-center px-1 rounded-[3px] font-medium cursor-pointer transition-colors select-none mx-0.5 align-baseline bg-[#5865F2]/10 text-[#5865F2] hover:bg-[#5865F2]/20',
      },
      suggestion: createMentionSuggestion({ queryClient, serverId }),
    });
  }, [queryClient, serverId]);

  const emptyDoc = useMemo(() => parseContentStringToTiptapDoc(''), []);

  const extensions = useMemo(() => {
    return [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      ...(mentionExtension ? [mentionExtension] : []),
      Placeholder.configure({
        placeholder: () => placeholderRef.current,
      }),
    ];
  }, [mentionExtension]);

  const editorProps = useMemo(() => {
    return {
      attributes: {
        class:
          'outline-none text-mew-text placeholder-mew-textMuted whitespace-pre-wrap break-words min-h-[22px]',
      },
      handleKeyDown: (_: any, event: KeyboardEvent) => {
        if (event.key === 'Enter' && !event.shiftKey) {
          event.preventDefault();
          sendMessageRef.current();
          return true;
        }

        if (event.key === 'Escape') {
          return true;
        }

        return false;
      },
      handlePaste: (_view: any, event: ClipboardEvent) => {
        if (!channelId || isUploading) return false;

        const files: File[] = [];
        const dt = event.clipboardData;
        if (dt) {
          if (dt.files && dt.files.length > 0) {
            files.push(...Array.from(dt.files));
          } else if (dt.items && dt.items.length > 0) {
            for (const item of Array.from(dt.items)) {
              if (item.kind === 'file') {
                const f = item.getAsFile();
                if (f) files.push(f);
              }
            }
          }
        }

        const images = files.filter((f) => (f.type || '').startsWith('image/'));
        if (images.length === 0) return false;

        event.preventDefault();

        const normalized = images.map((f, idx) => {
          if (f.name && f.name.trim()) return f;
          const ext = (f.type || '').split('/')[1] || 'png';
          return new File([f], `pasted-image-${Date.now()}-${idx}.${ext}`, { type: f.type || 'image/png' });
        });

        queueFilesForUpload(normalized);
        return true;
      },
    };
  }, [channelId, isUploading]);

  const editor = useEditor({
    extensions,
    content: emptyDoc,
    editable: canSendMessage && !isUploading,
    editorProps,
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(canSendMessage && !isUploading);
  }, [canSendMessage, editor, isUploading]);

  useEffect(() => {
    if (!editor) return;
    if (activeReplyTo) {
      requestAnimationFrame(() => editor.commands.focus('end'));
    }
  }, [activeReplyTo, editor]);

  const uploadFile = useCallback(async (attachment: any, index: number) => {
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

      setAttachments(prev => {
        const newAttachments = [...prev];
        if (newAttachments[index]) {
          newAttachments[index].isUploading = false;
          // Store the object `key`; server hydrates the final URL.
          newAttachments[index].key = response.data.key;
          newAttachments[index].progress = 100;
        }
        return newAttachments;
      });

    } catch (error) {
      console.error('File upload failed:', error);
      setAttachments(prev => {
          const newAttachments = [...prev];
          if (newAttachments[index]) {
            newAttachments[index].isUploading = false;
            newAttachments[index].error = 'Upload Failed';
          }
          return newAttachments;
      });
    }
  }, [channelId]);

  const queueFilesForUpload = useCallback((files: File[]) => {
    if (!channelId || files.length === 0) return;

    const newUploads = files.map((file: File) => ({
      filename: file.name,
      contentType: file.type,
      size: file.size,
      localUrl: URL.createObjectURL(file),
      isUploading: true,
      progress: 0,
      file: file,
    }));

    setAttachments((prev) => {
      const startIndex = prev.length;
      setTimeout(() => {
        newUploads.forEach((upload, i) => void uploadFile(upload, startIndex + i));
      }, 0);
      return [...prev, ...newUploads];
    });
  }, [channelId, uploadFile]);

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !channelId) return;

    const files = Array.from(e.target.files);
    queueFilesForUpload(files);

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSendMessage = async () => {
    if (!editor || !channelId || isUploading) return;

    const doc = editor.getJSON();
    const contentToSend = serializeTiptapDocToContentString(doc);
    if (!contentToSend.trim() && attachments.length === 0) return;

    const mentionsToSend = extractMentionIdsFromDoc(doc);

    const currentServerId = serverId ? serverId : undefined;
    const replySnapshot = activeReplyTo;

    const tempId = new Date().toISOString();
    const user = useAuthStore.getState().user;

    if (!user) return;

    const newMessage: Message = {
      _id: tempId,
      channelId: channelId,
      authorId: user,
      content: contentToSend,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      type: 'DEFAULT',
      mentions: mentionsToSend,
      ...(replySnapshot ? { referencedMessageId: replySnapshot.messageId } : {}),
      attachments: attachments.map(a => ({
          filename: a.filename || '',
          contentType: a.contentType || '',
          url: a.localUrl || '',
          size: a.size || 0
      })),
    };

    queryClient.setQueryData(['messages', channelId], (oldData: Message[] | undefined) => {
      return oldData ? [...oldData, newMessage] : [newMessage];
    });

    editor.commands.setContent(emptyDoc, true);
    setAttachments([]);
    if (replySnapshot) clearReplyTo();

    try {
      const finalAttachments = attachments
        // Only send uploaded attachments (with key).
        .filter(a => !a.isUploading && a.key)
        .map(({ filename, contentType, key, size }) => ({ filename, contentType, key, size } as unknown as Attachment));

      console.log('Sending attachments:', finalAttachments);

      await messageApi.send(currentServerId, channelId, {
        content: contentToSend,
        attachments: finalAttachments,
        ...(replySnapshot ? { referencedMessageId: replySnapshot.messageId } : {}),
      });
      await queryClient.invalidateQueries({ queryKey: ['messages', channelId] });
    } catch (err) {
      queryClient.setQueryData(['messages', channelId], (oldData: Message[] | undefined) => {
        return oldData ? oldData.filter(m => m._id !== tempId) : [];
      });
      console.error("Failed to send message:", err);
      setAttachments(attachments);
      if (replySnapshot) setReplyTo(replySnapshot);
    }
  };

  sendMessageRef.current = () => {
    void handleSendMessage();
  };

  return (
    <div className="px-4 pb-6 pt-2 flex-shrink-0 relative">
      <style>{`
        .mew-chat-editor .ProseMirror p { margin: 0; }
      `}</style>

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

                {file.isUploading && (
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center">
                    <div className="w-12 h-12 border-4 border-t-transparent border-mew-accent rounded-full animate-spin"></div>
                    <span className="text-white text-sm mt-2 font-semibold">{file.progress}%</span>
                  </div>
                )}

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

      {activeReplyTo && (
        <div className="bg-[#2B2D31] border border-[#1E1F22] rounded-lg px-3 py-2 mb-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xs text-mew-textMuted">
              回复 <span className="text-mew-text">{activeReplyTo.authorUsername || 'Unknown'}</span>
            </div>
            {activeReplyTo.preview && (
              <div className="text-xs text-mew-textMuted truncate">{activeReplyTo.preview}</div>
            )}
          </div>
          <button
            type="button"
            className="text-mew-textMuted hover:text-mew-text p-1 rounded hover:bg-mew-darker flex-shrink-0"
            onClick={() => clearReplyTo()}
            aria-label="cancel reply"
          >
            <Icon icon="mdi:close" width="18" height="18" />
          </button>
        </div>
      )}

      <form 
        onSubmit={(e) => { e.preventDefault(); void handleSendMessage(); }} 
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
        <div className="mew-chat-editor bg-transparent flex-1 disabled:cursor-not-allowed">
          {editor ? <EditorContent editor={editor} /> : null}
        </div>
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
