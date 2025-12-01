import React from 'react';
import ServerList from './ServerList';
import ChannelList from './ChannelList';
import ChatArea from './ChatArea';
import Modal from './Modals';
import UserSettings from './UserSettings';

const Layout: React.FC = () => {
  return (
    <div className="flex w-screen h-screen overflow-hidden bg-mew-dark font-sans text-mew-text selection:bg-mew-accent selection:text-white">
      <ServerList />
      <ChannelList />
      <ChatArea />
      <Modal />
      <UserSettings />
    </div>
  );
};

export default Layout;