import { useEffect } from 'react';
import ServerList from '../features/servers/components/ServerList';
import ChannelList from '../features/channels/components/ChannelList';
import ChatArea from '../features/chat/components/ChatArea';
import UserSettings from '../features/users/components/UserSettings';
import ModalManager from './modals/ModalManager';
import { usePresenceEvents } from '../shared/hooks/usePresenceEvents';
import { useGlobalSocketEvents } from '../shared/hooks/useGlobalSocketEvents';
import { useUnreadInitialization } from '../shared/hooks/useUnreadInitialization';
import useTabNotifier from '../shared/hooks/useTabNotifier';
import { useQueryClient } from '@tanstack/react-query';
import { useUIStore, useUnreadServerStore, useUnreadStore } from '../shared/stores';
import { useMembers } from '../shared/hooks/useMembers';
import { useServers } from '../features/servers/hooks/useServers';

const Layout = () => {
  usePresenceEvents();
  useGlobalSocketEvents();
  useUnreadInitialization();
  useTabNotifier();
  const queryClient = useQueryClient();
  const initializeNotifier = useUnreadServerStore(state => state.initializeNotifier);

  const { data: servers } = useServers();
  const { currentServerId } = useUIStore();
  useMembers(currentServerId);

  useEffect(() => {
    if (!servers) return;
    initializeNotifier(queryClient, servers.map(s => s._id));
  }, [servers, initializeNotifier, queryClient]);

  const { targetMessageId, setTargetMessageId } = useUIStore();
  const addUnreadMention = useUnreadStore(state => state.addUnreadMention);

  useEffect(() => {
    if (targetMessageId) {
      addUnreadMention(targetMessageId);
      setTargetMessageId(null);
    }
  }, [targetMessageId, addUnreadMention, setTargetMessageId]);

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
