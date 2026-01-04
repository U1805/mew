import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import { stickerApi, userStickerApi } from '../../../shared/services/api';
import type { Sticker } from '../../../shared/types';

interface StickerPickerProps {
  serverId: string | null;
  onSelect: (sticker: Sticker) => void;
  onClose: () => void;
}

const RECENTS_KEY = 'mew.recentStickers.v2';

const getStickerScope = (sticker: Sticker): 'server' | 'user' => {
  if (sticker.scope === 'server' || sticker.scope === 'user') return sticker.scope;
  return sticker.serverId ? 'server' : 'user';
};

const loadRecents = (): Record<string, string[]> => {
  try {
    const raw = localStorage.getItem(RECENTS_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as Record<string, string[]>;
  } catch {
    return {};
  }
};

const pushRecent = (contextKey: string, stickerKey: string) => {
  try {
    const all = loadRecents();
    const prev = Array.isArray(all[contextKey]) ? all[contextKey] : [];
    const next = [stickerKey, ...prev.filter((k) => k !== stickerKey)].slice(0, 24);
    all[contextKey] = next;
    localStorage.setItem(RECENTS_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
};

export const StickerPicker = ({ serverId, onSelect, onClose }: StickerPickerProps) => {
  const [query, setQuery] = useState('');
  const contextKey = serverId || '@dm';

  const { data: serverData, isLoading: isLoadingServer } = useQuery({
    queryKey: ['stickers', serverId],
    queryFn: () => stickerApi.list(serverId!).then((res) => res.data as Sticker[]),
    enabled: !!serverId,
    staleTime: 30_000,
  });

  const { data: userData, isLoading: isLoadingUser } = useQuery({
    queryKey: ['userStickers', 'me'],
    queryFn: () => userStickerApi.listMine().then((res) => res.data as Sticker[]),
    staleTime: 30_000,
  });

  const serverStickers = useMemo(() => (Array.isArray(serverData) ? serverData : []), [serverData]);
  const userStickers = useMemo(() => (Array.isArray(userData) ? userData : []), [userData]);
  const allStickers = useMemo(() => [...userStickers, ...serverStickers], [serverStickers, userStickers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allStickers;
    return allStickers.filter((s) => {
      const name = (s.name || '').toLowerCase();
      const description = (s.description || '').toLowerCase();
      return name.includes(q) || description.includes(q);
    });
  }, [allStickers, query]);

  const recent = useMemo(() => {
    const keys = loadRecents()[contextKey] || [];
    if (keys.length === 0) return [];
    const byKey = new Map(allStickers.map((s) => [`${getStickerScope(s)}:${s._id}`, s] as const));
    return keys.map((k) => byKey.get(k)).filter(Boolean) as Sticker[];
  }, [allStickers, contextKey]);

  const handlePick = (sticker: Sticker) => {
    pushRecent(contextKey, `${getStickerScope(sticker)}:${sticker._id}`);
    onSelect(sticker);
    // Optional: Keep open on select if you want multiselect style, Discord usually closes or keeps open. 
    // Usually closing is better for single interactions.
    onClose(); 
  };

  const isLoading = isLoadingUser || (serverId ? isLoadingServer : false);

  return (
    <>
      {/* Invisible backdrop to catch clicks outside */}
      <div className="fixed inset-0 z-40 cursor-default" onClick={onClose}></div>

      <div
        className={clsx(
          // Base styles
          'z-50 flex flex-col overflow-hidden bg-[#2B2D31] border border-[#1E1F22] rounded-lg shadow-2xl animate-scale-in',
          
          // --- Positioning Fix ---
          // Desktop: Absolute positioning relative to the button wrapper.
          // `bottom-[calc(100%+12px)]`: Anchors the bottom of the picker 12px ABOVE the top of the button.
          // `right-0`: Aligns the right edge with the button wrapper.
          'absolute right-0 bottom-[calc(100%+12px)] origin-bottom-right',
          'w-[340px] h-[400px]', 

          // Mobile Overrides (Centered Modal)
          'max-md:fixed max-md:left-1/2 max-md:top-1/2 max-md:-translate-x-1/2 max-md:-translate-y-1/2 max-md:w-[90vw] max-md:h-[50vh] max-md:origin-center max-md:right-auto max-md:bottom-auto'
        )}
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
      >
        {/* Header / Search */}
        <div className="flex-shrink-0 p-3 border-b border-[#202225] bg-[#2B2D31]">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search stickers"
              className="w-full bg-[#1E1F22] text-mew-text placeholder-mew-textMuted rounded-[4px] pl-2 pr-8 py-1.5 text-sm font-medium outline-none transition-all focus:ring-1 focus:ring-mew-accent"
              autoFocus
              disabled={isLoading}
            />
            <Icon 
                icon="mdi:magnify" 
                className="absolute right-2 top-1/2 -translate-y-1/2 text-mew-textMuted pointer-events-none" 
                width="18" 
            />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 bg-[#2B2D31]">
          {isLoading ? (
            <div className="flex justify-center items-center h-full">
               <Icon icon="mdi:loading" className="animate-spin text-mew-textMuted" width="32" />
            </div>
          ) : (
            <div className="space-y-4 pb-2">
              {/* Recent Section */}
              {recent.length > 0 && !query.trim() && (
                <div>
                  <div className="text-[11px] font-bold text-mew-textMuted uppercase mb-2 px-1">Recently Used</div>
                  <div className="grid grid-cols-4 gap-2">
                    {recent.map((s) => (
                      <button
                        key={`recent-${s._id}`}
                        className="aspect-square rounded-[4px] flex items-center justify-center hover:bg-[#36383E] transition-colors p-1 relative group"
                        onClick={() => handlePick(s)}
                        title={s.name}
                      >
                        <img src={s.url} alt={s.name} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-200" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Search Results */}
              {query.trim() ? (
                <div>
                  <div className="text-[11px] font-bold text-mew-textMuted uppercase mb-2 px-1">
                    Search Results
                  </div>
                  {filtered.length === 0 ? (
                    <div className="text-center py-8">
                      <div className="flex justify-center mb-2">
                        <Icon icon="mdi:sticker-emoji" className="text-[#404249]" width="48" />
                      </div>
                      <p className="text-mew-textMuted text-sm">No stickers found.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {filtered.map((s) => (
                        <button
                          key={`${getStickerScope(s)}-${s._id}`}
                          className="aspect-square rounded-[4px] flex items-center justify-center hover:bg-[#36383E] transition-colors p-1 relative group"
                          onClick={() => handlePick(s)}
                          title={s.name}
                        >
                          <img
                            src={s.url}
                            alt={s.name}
                            className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-200"
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* Personal Stickers */}
                  <div>
                    <div className="text-[11px] font-bold text-mew-textMuted uppercase mb-2 px-1">
                      {serverId ? 'Personal Stickers' : 'My Stickers'}
                    </div>
                    {userStickers.length === 0 ? (
                      <div className="text-center py-6 text-mew-textMuted text-sm">
                        You don&apos;t have any stickers yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-4 gap-2">
                        {userStickers.map((s) => (
                          <button
                            key={`user-${s._id}`}
                            className="aspect-square rounded-[4px] flex items-center justify-center hover:bg-[#36383E] transition-colors p-1 relative group"
                            onClick={() => handlePick(s)}
                            title={s.name}
                          >
                            <img
                              src={s.url}
                              alt={s.name}
                              className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-200"
                            />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Server Stickers */}
                  {serverId && (
                    <div>
                      <div className="text-[11px] font-bold text-mew-textMuted uppercase mb-2 px-1">
                        Server Stickers
                      </div>
                      {serverStickers.length === 0 ? (
                        <div className="text-center py-6 text-mew-textMuted text-sm">No server stickers.</div>
                      ) : (
                        <div className="grid grid-cols-4 gap-2">
                          {serverStickers.map((s) => (
                            <button
                              key={`server-${s._id}`}
                              className="aspect-square rounded-[4px] flex items-center justify-center hover:bg-[#36383E] transition-colors p-1 relative group"
                              onClick={() => handlePick(s)}
                              title={s.name}
                            >
                              <img
                                src={s.url}
                                alt={s.name}
                                className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-200"
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

            </div>
          )}
        </div>
      </div>
    </>
  );
};
