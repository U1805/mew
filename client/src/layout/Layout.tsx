import { useEffect } from 'react';
import clsx from 'clsx';
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
import { useUIStore, useUnreadServerStore } from '../shared/stores';
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
  const { currentServerId, mobileSidebarOpen, toggleMobileSidebar, setMemberListOpen } = useUIStore(); // Destructure setMemberListOpen
  useMembers(currentServerId);

  // Initialize Member List state based on screen size
  useEffect(() => {
    const checkScreenSize = () => {
      if (window.innerWidth >= 768) { // 768px is tailwind 'md' breakpoint
        setMemberListOpen(true);
      } else {
        setMemberListOpen(false);
      }
    };

    checkScreenSize();
    // Optional: Add resize listener if you want dynamic updates, 
    // but usually initial load is sufficient for this logic.
  }, [setMemberListOpen]);

  useEffect(() => {
    if (!servers) return;
    initializeNotifier(queryClient, servers.map(s => s._id));
  }, [servers, initializeNotifier, queryClient]);

  return (
    <div className="flex w-full h-full overflow-hidden bg-mew-dark font-sans text-mew-text selection:bg-mew-accent selection:text-white relative">
      
      {/* Mobile Sidebar Backdrop with Fade */}
      <div 
        className={clsx(
          "fixed inset-0 bg-black/60 z-30 md:hidden transition-opacity duration-300 ease-ios",
          mobileSidebarOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        )}
        onClick={() => toggleMobileSidebar(false)}
        aria-hidden="true"
      />

      {/* 
        Navigation Group (Sidebar)
        Added 'will-change-transform' and updated easing to 'ease-ios'
      */}
      <div 
        className={clsx(
          "flex h-full flex-shrink-0 z-40 bg-mew-darker",
          "absolute inset-y-0 left-0 md:relative",
          "transition-transform duration-300 ease-ios will-change-transform shadow-[4px_0_24px_rgba(0,0,0,0.4)] md:shadow-none", 
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0",
          "w-[320px] md:w-auto"
        )}
      >
        <ServerList />
        <ChannelList />
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 min-w-0 bg-mew-dark h-full relative z-0 flex flex-col">
        <ChatArea />
      </div>

      <ModalManager />
      <UserSettings />
    </div>
  );
};

export default Layout;
