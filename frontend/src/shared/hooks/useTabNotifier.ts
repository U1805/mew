import { useEffect, useRef } from 'react';
import { useUnreadStore } from '../stores/store';
import { generateFavicon, updateFavicon } from '../utils/favicon';

const useTabNotifier = () => {
  const unreadCount = useUnreadStore((state) => state.unreadChannelIds.size);
  const originalTitleRef = useRef(document.title);

  // Effect for updating title and favicon based on unread count
  useEffect(() => {
    const update = async () => {
      // Only update if the page is hidden
      if (document.hidden) {
        if (unreadCount > 0) {
          document.title = `(${unreadCount}) ${originalTitleRef.current}`;
          const faviconUrl = await generateFavicon(unreadCount);
          updateFavicon(faviconUrl);
        } else {
          // Restore original if count drops to zero while hidden
          document.title = originalTitleRef.current;
          const faviconUrl = await generateFavicon(0);
          updateFavicon(faviconUrl);
        }
      }
    };

    update();
  }, [unreadCount]);

  // Effect for handling page visibility changes
  useEffect(() => {
    const handleVisibilityChange = async () => {
      if (document.hidden) {
        // Page is hidden, update title and favicon if there are unread messages
        if (unreadCount > 0) {
          document.title = `(${unreadCount}) ${originalTitleRef.current}`;
          const faviconUrl = await generateFavicon(unreadCount);
          updateFavicon(faviconUrl);
        }
      } else {
        // Page is visible, restore original title and favicon
        document.title = originalTitleRef.current;
        const faviconUrl = await generateFavicon(0);
        updateFavicon(faviconUrl);
      }
    };

    // Store the original title once when the hook mounts
    if (originalTitleRef.current === undefined) {
      originalTitleRef.current = document.title;
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Clean up the event listener on unmount
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [unreadCount]); // Dependency on unreadCount ensures the correct count is used when visibility changes

};

export default useTabNotifier;