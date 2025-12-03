
import React from 'react';
import ServerList from '../servers/ServerList';
import ChannelList from '../channels/ChannelList';
import ChatArea from '../chat/ChatArea';
import ModalManager from '../modals/ModalManager';
import UserSettings from '../user/UserSettings';
import { usePresenceEvents } from '../../hooks/usePresenceEvents';

const Layout: React.FC = () => {
  usePresenceEvents();

  return (
    <div className="flex w-screen h-screen overflow-hidden bg-mew-dark font-sans text-mew-text selection:bg-mew-accent selection:text-white">
      <ServerList />
      <ChannelList />
      <ChatArea />
      <ModalManager />
      <UserSettings />
    </div>
  );
};

export default Layout;
