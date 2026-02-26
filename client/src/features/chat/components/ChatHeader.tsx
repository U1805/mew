import { useState, useEffect, useRef } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { Channel, ChannelType } from '../../../shared/types';
import { useUIStore } from '../../../shared/stores';
import { useModalStore } from '../../../shared/stores';
import { useAuthStore } from '../../../shared/stores/authStore';
import { usePresenceStore } from '../../../shared/stores/presenceStore';
import { formatUserTag } from '../../../shared/utils/userTag';
import { useI18n } from '../../../shared/i18n';

interface ChatHeaderProps {
  channel: Channel | null;
  isMemberListOpen: boolean;
  toggleMemberList: () => void;
}

const ChatHeader: React.FC<ChatHeaderProps> = ({ channel, isMemberListOpen, toggleMemberList }) => {
  const { t } = useI18n();
  const { user } = useAuthStore();
  const { openModal } = useModalStore();
  const onlineStatus = usePresenceStore((state) => state.onlineStatus);
  const [mobileSearchActive, setMobileSearchActive] = useState(false);
  const {
    currentServerId,
    setSearchOpen,
    setSearchQuery,
    isSearchOpen,
    setDmSearchOpen,
    setDmSearchQuery,
    isDmSearchOpen,
    toggleMobileSidebar,
  } = useUIStore();

  const [inputValue, setInputValue] = useState('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [dmInputValue, setDmInputValue] = useState('');
  const dmDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync internal state with store state (handle closing from other components)
  useEffect(() => {
    if (!isSearchOpen && !isDmSearchOpen) {
        setMobileSearchActive(false);
    }
  }, [isSearchOpen, isDmSearchOpen]);

  useEffect(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);

    debounceTimerRef.current = setTimeout(() => {
      setSearchQuery(inputValue);
      // Only auto-open if we are typing, not just clearing
      if (inputValue.trim()) setSearchOpen(true);
    }, 300);

    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    };
  }, [inputValue, setSearchQuery, setSearchOpen]);

  useEffect(() => {
    if (!isSearchOpen) {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      setInputValue('');
      setSearchQuery('');
    }
  }, [isSearchOpen, setSearchQuery]);

  useEffect(() => {
    if (dmDebounceTimerRef.current) clearTimeout(dmDebounceTimerRef.current);

    dmDebounceTimerRef.current = setTimeout(() => {
      setDmSearchQuery(dmInputValue);
      if (dmInputValue.trim()) setDmSearchOpen(true);
    }, 300);

    return () => {
      if (dmDebounceTimerRef.current) clearTimeout(dmDebounceTimerRef.current);
      dmDebounceTimerRef.current = null;
    };
  }, [dmInputValue, setDmSearchQuery, setDmSearchOpen]);

  useEffect(() => {
    if (!isDmSearchOpen) {
      if (dmDebounceTimerRef.current) clearTimeout(dmDebounceTimerRef.current);
      dmDebounceTimerRef.current = null;
      setDmInputValue('');
      setDmSearchQuery('');
    }
  }, [isDmSearchOpen, setDmSearchQuery]);

  const isDM = channel?.type === ChannelType.DM;
  const isWeb = channel?.type === ChannelType.GUILD_WEB;
  
  let title = channel?.name || t('notification.channel.unnamed');
  let otherUser: any = null;

  if (isDM && channel?.recipients) {
    otherUser = channel.recipients.find((r: any) => r._id !== user?._id);
    if (otherUser) {
        title = formatUserTag(otherUser);
    }
  }

  const isOnline = otherUser && onlineStatus[otherUser._id] === 'online';

  const handleMobileCancel = () => {
    setMobileSearchActive(false);
    if (isDM) setDmSearchOpen(false);
    else setSearchOpen(false);
  };

  const handleMobileSearchStart = () => {
    setMobileSearchActive(true);
    if (isDM) setDmSearchOpen(true);
    else setSearchOpen(true);
  };

  return (
    <div className="h-12 border-b border-mew-darkest flex items-center px-4 shadow-sm flex-shrink-0 bg-mew-dark z-20 relative transition-colors duration-200">
      
      {/* Mobile Search Overlay - Transforms existing header into search bar */}
      {mobileSearchActive && (
        <div className="absolute inset-0 bg-[#2B2D31] z-30 flex items-center px-3 animate-fade-in w-full">
           <div className="flex-1 relative flex items-center">
              <input 
                  type="text" 
                  autoFocus
                  placeholder={isDM ? t('search.dmTitle') : t('search.title')}
                  value={isDM ? dmInputValue : inputValue}
                  onChange={(e) => isDM ? setDmInputValue(e.target.value) : setInputValue(e.target.value)}
                  className="bg-[#1E1F22] text-sm rounded-md pl-9 pr-8 py-1.5 w-full focus:outline-none text-white placeholder-mew-textMuted border-none" 
              />
              <Icon icon="mdi:magnify" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-mew-textMuted" width="18" />
              {(isDM ? dmInputValue : inputValue) && (
                  <button 
                    onClick={() => isDM ? setDmInputValue('') : setInputValue('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-mew-textMuted hover:text-white"
                  >
                      <Icon icon="mdi:close-circle" width="16" />
                  </button>
              )}
           </div>
           <button 
             onClick={handleMobileCancel} 
             className="ml-3 text-white text-sm font-medium whitespace-nowrap active:opacity-70"
           >
             {t('common.cancel')}
           </button>
        </div>
      )}

      {/* Hamburger / Back Button (Mobile) - Hidden when searching */}
      <button 
        className={clsx("md:hidden mr-3 text-mew-textMuted hover:text-white cursor-pointer active:scale-90 transition-transform p-1 -ml-1", mobileSearchActive && "hidden")}
        onClick={() => toggleMobileSidebar(true)}
      >
        <Icon icon="mdi:menu" width="26" height="26" />
      </button>

      <div className={clsx("text-mew-textMuted mr-2 flex items-center justify-center", mobileSearchActive && "hidden")}>
          {isDM ? (
              <Icon icon="mdi:at" width="24" height="24" />
          ) : isWeb ? (
              <Icon icon="mdi:web" width="24" height="24" />
          ) : (
              <Icon icon="mdi:pound" width="24" height="24" />
          )}
      </div>

      <span className={clsx("font-bold text-white mr-2 truncate flex-1 md:flex-none", mobileSearchActive && "hidden")}>{title}</span>

      {isDM && otherUser && !mobileSearchActive && (
           <div className="flex items-center flex-shrink-0">
                <div className={clsx(
                    "w-2.5 h-2.5 rounded-full mr-2",
                    isOnline ? "bg-green-500" : "bg-gray-500"
                )}></div>
                {isOnline && <span className="text-xs text-mew-textMuted hidden sm:block">{t('plugin.online')}</span>}
           </div>
      )}

      {!isDM && !mobileSearchActive && (
        <span className="text-xs text-mew-textMuted border-l border-mew-textMuted pl-2 ml-2 hidden md:block truncate max-w-[300px]">
          {isWeb ? (channel?.url || t('chat.web.noUrlSetShort')) : (channel?.topic || t('chat.welcome', { title }))}
        </span>
      )}
      
      <div className="ml-auto flex items-center space-x-3 text-mew-textMuted flex-shrink-0">
        {/* Mobile Search Icon Trigger */}
        <button 
          className={clsx("lg:hidden hover:text-mew-text p-1 active:bg-[#35373C] rounded", (mobileSearchActive || isWeb) && "hidden")}
          onClick={handleMobileSearchStart}
        >
           <Icon icon="mdi:magnify" width="22" />
        </button>

        {!isDM && !isWeb && currentServerId && channel && (
            <button
              className="hidden lg:block hover:text-mew-text p-1 rounded transition-colors"
              title={t('server.menu.notificationSettings')}
              onClick={() => openModal('channelNotifications', { channel })}
            >
              <Icon icon="mdi:bell" width="22" />
            </button>
        )}

        <Icon icon="mdi:pin" className="hover:text-mew-text cursor-pointer hidden sm:block" width="22" />

        {isWeb && channel?.url && (
          <a
            href={channel.url}
            target="_blank"
            rel="noreferrer"
            className={clsx("p-1 hover:text-mew-text transition-colors hidden sm:block", mobileSearchActive && "hidden")}
            title={t('chat.web.openInNewTab')}
          >
            <Icon icon="mdi:open-in-new" width="22" />
          </a>
        )}

        {!isDM && (
            <button 
              className={clsx("p-1 transition-colors active:scale-95", isMemberListOpen ? "text-white" : "hover:text-mew-text", mobileSearchActive && "hidden")}
              onClick={toggleMemberList}
            >
              <Icon icon="mdi:account-group" width="24" height="24" />
            </button>
        )}

        {/* Desktop Search Inputs */}
        {!isDM && !isWeb && currentServerId && (
            <div className={clsx("relative hidden lg:block transition-all", isSearchOpen ? "w-60" : "w-36 focus-within:w-60")}>
            <input 
                type="text" 
                placeholder={t('search.title')} 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onFocus={() => { if (inputValue.trim()) setSearchOpen(true); }}
                className="bg-mew-darker text-sm rounded px-2 py-0.5 w-full transition-all focus:outline-none text-mew-text placeholder-mew-textMuted" 
            />
            <Icon icon="mdi:magnify" className="absolute right-1 top-1 text-xs pointer-events-none" />
            </div>
        )}

        {isDM && (
            <div className={clsx("relative hidden lg:block transition-all", isDmSearchOpen ? "w-60" : "w-36 focus-within:w-60")}>
            <input 
                type="text" 
                placeholder={t('search.title')} 
                value={dmInputValue}
                onChange={(e) => setDmInputValue(e.target.value)}
                onFocus={() => {
                    if (dmInputValue.trim()) setDmSearchOpen(true);
                }}
                className="bg-mew-darker text-sm rounded px-2 py-0.5 w-full transition-all focus:outline-none text-mew-text placeholder-mew-textMuted" 
            />
            <Icon icon="mdi:magnify" className="absolute right-1 top-1 text-xs pointer-events-none" />
            </div>
        )}
      </div>
    </div>
  );
};

export default ChatHeader;

