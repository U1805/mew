import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import { stickerApi } from '../../../shared/services/api';
import type { Sticker } from '../../../shared/types';

interface StickerPickerProps {
  serverId: string | null;
  onSelect: (sticker: Sticker) => void;
  onClose: () => void;
}

const RECENTS_KEY = 'mew.recentStickers.v1';

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

const pushRecent = (serverId: string, stickerId: string) => {
  try {
    const all = loadRecents();
    const prev = Array.isArray(all[serverId]) ? all[serverId] : [];
    const next = [stickerId, ...prev.filter((id) => id !== stickerId)].slice(0, 24);
    all[serverId] = next;
    localStorage.setItem(RECENTS_KEY, JSON.stringify(all));
  } catch {
    // ignore
  }
};

export const StickerPicker = ({ serverId, onSelect, onClose }: StickerPickerProps) => {
  const [query, setQuery] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['stickers', serverId],
    queryFn: () => stickerApi.list(serverId!).then((res) => res.data as Sticker[]),
    enabled: !!serverId,
    staleTime: 30_000,
  });

  const stickers = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return stickers;
    return stickers.filter((s) => {
      const name = (s.name || '').toLowerCase();
      const tags = Array.isArray(s.tags) ? s.tags.join(' ').toLowerCase() : '';
      return name.includes(q) || tags.includes(q);
    });
  }, [query, stickers]);

  const recent = useMemo(() => {
    if (!serverId) return [];
    const ids = loadRecents()[serverId] || [];
    if (ids.length === 0) return [];
    const byId = new Map(stickers.map((s) => [s._id, s] as const));
    return ids.map((id) => byId.get(id)).filter(Boolean) as Sticker[];
  }, [serverId, stickers]);

  const handlePick = (sticker: Sticker) => {
    if (serverId) pushRecent(serverId, sticker._id);
    onSelect(sticker);
    // Optional: Keep open on select if you want multiselect style, Discord usually closes or keeps open. 
    // Usually closing is better for single interactions.
    onClose(); 
  };

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
              disabled={!serverId}
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
          {!serverId ? (
            <div className="flex flex-col items-center justify-center h-full text-center p-4">
               <div className="w-16 h-16 bg-[#1E1F22] rounded-full flex items-center justify-center mb-3">
                  <Icon icon="mdi:server-off" className="text-mew-textMuted" width="32" />
               </div>
               <p className="text-mew-text text-sm font-semibold">Stickers Unavailable</p>
               <p className="text-mew-textMuted text-xs mt-1">Stickers are currently only available inside servers.</p>
            </div>
          ) : isLoading ? (
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

              {/* Main Grid */}
              <div>
                <div className="text-[11px] font-bold text-mew-textMuted uppercase mb-2 px-1">
                    {query ? 'Search Results' : 'Server Stickers'}
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
                        key={s._id}
                        className="aspect-square rounded-[4px] flex items-center justify-center hover:bg-[#36383E] transition-colors p-1 relative group"
                        onClick={() => handlePick(s)}
                        title={s.name}
                      >
                        <img src={s.url} alt={s.name} className="w-full h-full object-contain group-hover:scale-110 transition-transform duration-200" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
