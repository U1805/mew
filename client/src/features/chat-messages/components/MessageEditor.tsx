import { useMemo, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Message } from '../../../shared/types';
import { messageApi } from '../../../shared/services/api';
import { useUIStore } from '../../../shared/stores';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Mention from '@tiptap/extension-mention';
import Placeholder from '@tiptap/extension-placeholder';
import { createMentionSuggestion } from '../../chat-editor/hooks/mentionSuggestion';
import { parseContentStringToTiptapDoc, serializeTiptapDocToContentString } from '../../chat-editor/hooks/chatContent';

interface MessageEditorProps {
    message: Message;
    onCancel: () => void;
}

const MessageEditor = ({ message, onCancel }: MessageEditorProps) => {
    const { currentServerId } = useUIStore();
    const queryClient = useQueryClient();
    const saveRef = useRef<() => void>(() => {});

    const author = typeof message.authorId === 'object' ? message.authorId : { username: 'Unknown', avatarUrl: '', _id: message.authorId as string, isBot: false, createdAt: new Date().toISOString(), email: '' };

    const mentionExtension = useMemo(() => {
      if (!currentServerId) return null;
      return Mention.configure({
        HTMLAttributes: {
          class:
            'inline-flex items-center px-1 rounded-[3px] font-medium cursor-pointer transition-colors select-none mx-0.5 align-baseline bg-[#5865F2]/10 text-[#5865F2] hover:bg-[#5865F2]/20',
        },
        suggestion: createMentionSuggestion({ queryClient, serverId: currentServerId }),
      });
    }, [currentServerId, queryClient]);

    const initialContent = useMemo(() => parseContentStringToTiptapDoc(message.content), [message.content]);

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
          placeholder: 'Edit message',
        }),
      ];
    }, [mentionExtension]);

    const editorProps = useMemo(() => {
      return {
        attributes: {
          class: 'outline-none text-mew-text whitespace-pre-wrap break-words min-h-[22px]',
        },
        handleKeyDown: (_: any, event: KeyboardEvent) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            saveRef.current();
            return true;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
            return true;
          }
          return false;
        },
      };
    }, [onCancel]);

    const editor = useEditor({
      extensions,
      content: initialContent,
      autofocus: true,
      editorProps,
    });

    const handleEdit = async () => {
        if (!editor) return;

        const editContent = serializeTiptapDocToContentString(editor.getJSON());
        if (!editContent.trim() || editContent === message.content) {
            onCancel();
            return;
        }

        try {
            await messageApi.update(currentServerId || undefined, message.channelId, message._id, editContent);
            queryClient.setQueryData(['messages', message.channelId], (old: Message[] | undefined) => {
                if (!old) return old;
                return old.map(m => m._id === message._id ? { ...m, content: editContent, editedAt: new Date().toISOString() } : m);
            });
            onCancel();
        } catch (error) {
            console.error("Failed to edit message", error);
        }
    };

    saveRef.current = () => {
      void handleEdit();
    };

    const dateString = message.createdAt && !isNaN(new Date(message.createdAt).getTime()) 
        ? format(new Date(message.createdAt), 'MM/dd/yyyy h:mm a') 
        : '';

    return (
        <div className="py-0.5 px-4 bg-[#2e3035]/50 flex pr-4 mt-[17px]">
            <style>{`
              .mew-message-editor .ProseMirror p { margin: 0; }
            `}</style>
            <div className="w-10 h-10 rounded-full bg-mew-accent flex items-center justify-center text-white font-semibold mr-4 mt-0.5 opacity-50">
                {author.username.slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 w-full">
                <div className="flex items-center mb-1">
                    <span className="font-medium text-white mr-2">{author.username}</span>
                    <span className="text-xs text-mew-textMuted">{dateString}</span>
                </div>
                <div className="bg-[#383A40] rounded p-2">
                    <div className="mew-message-editor">
                      {editor ? <EditorContent editor={editor} /> : null}
                    </div>
                </div>
                <div className="text-xs mt-2 space-x-2">
                    <span className="text-mew-textMuted">escape to <span onClick={onCancel} className="text-mew-accent hover:underline cursor-pointer">cancel</span></span>
                    <span className="text-mew-textMuted">•</span>
                    <span className="text-mew-textMuted">enter to <span onClick={handleEdit} className="text-mew-accent hover:underline cursor-pointer">save</span></span>
                </div>
            </div>
        </div>
    );
};

export default MessageEditor;
