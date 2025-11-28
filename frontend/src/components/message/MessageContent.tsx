import React from 'react';
import RssCard from './custom/RssCard';

const MessageContent = ({ message }) => {
  switch (message.type) {
    case 'app/x-rss-card':
      return <RssCard payload={message.payload} />;
    default:
      return <p>{message.content}</p>;
  }
};

export default MessageContent;
