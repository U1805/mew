import React, { useEffect } from 'react';
import ServerList from '../features/servers/components/ServerList';
import ChannelList from '../features/channels/components/ChannelList';
import ChatArea from '../features/chat/components/ChatArea';
import UserSettings from '../features/users/components/UserSettings';
import ModalManager from '../layout/modals/ModalManager';
import { usePresenceEvents } from '../shared/hooks/usePresenceEvents';
import { useGlobalSocketEvents } from '../shared/hooks/useGlobalSocketEvents';
import useTabNotifier from '../shared/hooks/useTabNotifier';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { serverApi } from '../shared/services/api';
import { useUIStore, useUnreadServerStore, useUnreadStore } from '../shared/stores/store';
import { useMembers } from '../shared/hooks/useMembers';

const Layout: React.FC = () => {
  usePresenceEvents();
  useGlobalSocketEvents();
  useTabNotifier();
  const queryClient = useQueryClient();
  const initializeNotifier = useUnreadServerStore(state => state.initializeNotifier);

  // Fetch all servers to provide their IDs to the unread server store
  const { data: servers } = useQuery({
    queryKey: ['servers'],
    queryFn: () => serverApi.list().then(res => res.data),
  });

  const { currentServerId } = useUIStore();

  // Pre-fetch members for the current server to populate mention cache
  useMembers(currentServerId);

  // Initialize the communication bridge between a channel unread state and server unread state
  useEffect(() => {
    if (servers) {
      const serverIds = servers.map(s => s._id);
      initializeNotifier(queryClient, serverIds);
    }
  }, [servers, initializeNotifier, queryClient]);

  const { targetMessageId, setTargetMessageId } = useUIStore();
  const addUnreadMention = useUnreadStore(state => state.addUnreadMention);

  // Effect to trigger mention flash when jumping to a message
  useEffect(() => {
    if (targetMessageId) {
      addUnreadMention(targetMessageId);
      // Immediately clear it so it doesn't re-trigger on component re-renders
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
