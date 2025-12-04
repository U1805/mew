import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Message } from '../../../shared/types';
import { messageApi } from '../../../shared/services/api';
import { useUIStore } from '../../../shared/stores/store';

interface MessageEditorProps {
    message: Message;
    onCancel: () => void;
}

const MessageEditor: React.FC<MessageEditorProps> = ({ message, onCancel }) => {
    const { currentServerId } = useUIStore();
    const queryClient = useQueryClient();
    const [editContent, setEditContent] = useState(message.content);

    const author = typeof message.authorId === 'object' ? message.authorId : { username: 'Unknown', avatarUrl: '', _id: message.authorId as string, isBot: false, createdAt: new Date().toISOString(), email: '' };

    const handleEdit = async () => {
        if (!editContent.trim() || editContent === message.content) {
            onCancel();
            return;
        }

        try {
            // The original implementation had a bug where an empty string was passed instead of undefined.
            await messageApi.update(currentServerId || undefined, message.channelId, message._id, editContent);
            // Optimistic update
            queryClient.setQueryData(['messages', message.channelId], (old: Message[] | undefined) => {
                if (!old) return old;
                return old.map(m => m._id === message._id ? { ...m, content: editContent, editedAt: new Date().toISOString() } : m);
            });
            onCancel();
        } catch (error) {
            console.error("Failed to edit message", error);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleEdit();
        } else if (e.key === 'Escape') {
            onCancel();
        }
    };

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
                    <span className="text-mew-textMuted">escape to <span onClick={onCancel} className="text-mew-accent hover:underline cursor-pointer">cancel</span></span>
                    <span className="text-mew-textMuted">•</span>
                    <span className="text-mew-textMuted">enter to <span onClick={handleEdit} className="text-mew-accent hover:underline cursor-pointer">save</span></span>
                </div>
            </div>
        </div>
    );
};

export default MessageEditor;