import React from 'react';
import ServerList from '@/components/servers/ServerList';
import ChannelList from '@/components/channels/ChannelList';
import ChatArea from '@/components/chat/ChatArea';
import Modal from '@/components/modals/Modals';
import UserSettings from '@/components/user/UserSettings';

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