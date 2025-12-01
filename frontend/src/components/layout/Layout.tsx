import React from 'react';
import ServerList from '../servers/ServerList';
import ChannelList from '../channels/ChannelList';
import ChatArea from '../chat/ChatArea';
import Modal from '../modals/Modals';
import UserSettings from '../user/UserSettings';

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