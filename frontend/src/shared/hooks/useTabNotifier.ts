import { useEffect, useRef } from 'react';
import { useUnreadStore } from '../stores';
import { generateFavicon, updateFavicon } from '../utils/favicon';

const useTabNotifier = () => {
  const unreadCount = useUnreadStore((state) => state.unreadChannelIds.size);
  const originalTitleRef = useRef(document.title);

  const applyUnreadBadge = async (count: number) => {
    document.title = count > 0 ? `(${count}) ${originalTitleRef.current}` : originalTitleRef.current;
    updateFavicon(await generateFavicon(count));
  };

  useEffect(() => {
    if (!document.hidden) return;
    applyUnreadBadge(unreadCount);
  }, [unreadCount]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
      applyUnreadBadge(document.hidden ? unreadCount : 0);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [unreadCount]);
};

export default useTabNotifier;
