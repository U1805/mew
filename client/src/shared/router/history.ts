const NAV_EVENT = 'mew:navigate';

export const safeReplaceState = (pathname: string) => {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === pathname) return;
  window.history.replaceState({}, document.title, pathname);
  (queueMicrotask ?? ((cb: () => void) => Promise.resolve().then(cb)))(() => {
    window.dispatchEvent(new Event(NAV_EVENT));
  });
};

export const safePushState = (pathname: string) => {
  if (typeof window === 'undefined') return;
  if (window.location.pathname === pathname) return;
  window.history.pushState({}, document.title, pathname);
  (queueMicrotask ?? ((cb: () => void) => Promise.resolve().then(cb)))(() => {
    window.dispatchEvent(new Event(NAV_EVENT));
  });
};

export const addNavigationListener = (listener: () => void) => {
  if (typeof window === 'undefined') return () => {};

  window.addEventListener('popstate', listener);
  window.addEventListener(NAV_EVENT, listener as EventListener);

  return () => {
    window.removeEventListener('popstate', listener);
    window.removeEventListener(NAV_EVENT, listener as EventListener);
  };
};
