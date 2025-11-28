import React, { useState } from 'react';
import { useSocket } from '../providers/SocketProvider';
import { Icon } from '@iconify/react';

interface MessageInputProps {
  channelId: string;
  replyingTo: any; // Define a proper type for this later
  setReplyingTo: (message: any) => void;
}

const MessageInput: React.FC<MessageInputProps> = ({ channelId, replyingTo, setReplyingTo }) => {
  const [content, setContent] = useState('');
  const { socket } = useSocket();

  const handleSendMessage = () => {
    if (content.trim() && socket) {
      socket.emit('message/create', {
        channelId,
        content,
        referencedMessageId: replyingTo?._id,
      });
      setContent('');
      setReplyingTo(null);
    }
  };

  return (
    <div className="p-4 bg-gray-200 dark:bg-gray-700">
        {replyingTo && (
            <div className="bg-gray-300 dark:bg-gray-800 p-2 rounded-t-lg flex justify-between items-center text-sm">
                <span>Replying to <strong>{replyingTo.author.username}</strong></span>
                <button onClick={() => setReplyingTo(null)}>
                     <Icon icon="mdi:close" className="w-4 h-4" />
                </button>
            </div>
        )}
      <input
        type="text"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
        placeholder={`Message #${'channel-name'}`}
        className={`w-full p-2 bg-gray-100 dark:bg-gray-600 focus:outline-none ${replyingTo ? 'rounded-b-lg' : 'rounded-lg'}`}
      />
    </div>
  );
};

export default MessageInput;
