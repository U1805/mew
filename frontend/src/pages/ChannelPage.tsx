import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import MessageView from '../components/message/MessageView';
import MessageInput from '../components/message/MessageInput';

import { vi } from 'vitest';

const ChannelPage: React.FC = () => {
  const { channelId } = useParams<{ channelId: string }>();
  const [replyingTo, setReplyingTo] = useState(null);

  if (!channelId) {
    return <div>Select a channel</div>;
  }

  return (
    <div className="flex flex-col h-full">
      <MessageView setReplyingTo={setReplyingTo} />
      <MessageInput channelId={channelId} replyingTo={replyingTo} setReplyingTo={setReplyingTo} />
    </div>
  );
};

export default ChannelPage;
