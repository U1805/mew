
import React from 'react';
import ServerList from '../../features/servers/components/ServerList';
import ChannelList from '../../features/channels/components/ChannelList';
import ChatArea from '../chat/ChatArea';
import ModalManager from '../modals/ModalManager';
import UserSettings from '../../features/users/components/UserSettings';
import { usePresenceEvents } from '../../shared/hooks/usePresenceEvents';

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
