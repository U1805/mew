import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import type { Sticker } from '../../../shared/types';
import { userStickerApi } from '../../../shared/services/api';
import { useModalStore } from '../../../shared/stores';

const parseTags = (raw: string): string[] => {
  const s = (raw || '').trim();
  if (!s) return [];
  const parts = s.includes(',') ? s.split(',') : s.split(/\s+/g);
  return parts.map(t => t.trim()).filter(Boolean);
};

export const UserStickerPanel = () => {
  const queryClient = useQueryClient();
  const { openModal } = useModalStore();

  const inputRef = useRef<HTMLInputElement>(null);
  const [newStickerFile, setNewStickerFile] = useState<File | null>(null);
  const [newStickerPreview, setNewStickerPreview] = useState<string | null>(null);
  const [newStickerName, setNewStickerName] = useState('');
  const [newStickerTags, setNewStickerTags] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['userStickers', 'me'],
    queryFn: () => userStickerApi.listMine().then((res) => res.data as Sticker[]),
    staleTime: 30_000,
  });

  const stickers = useMemo(() => (Array.isArray(data) ? data : []), [data]);
  const [drafts, setDrafts] = useState<Record<string, { name: string; tags: string; description: string }>>({});

  useEffect(() => {
    if (!Array.isArray(stickers)) return;
    setDrafts((prev) => {
      const next = { ...prev };
      for (const s of stickers) {
        if (!next[s._id]) {
          next[s._id] = {
            name: s.name || '',
            tags: Array.isArray(s.tags) ? s.tags.join(' ') : '',
            description: s.description || '',
          };
        }
      }
      return next;
    });
  }, [stickers]);

  useEffect(() => {
    return () => {
      if (newStickerPreview) URL.revokeObjectURL(newStickerPreview);
    };
  }, [newStickerPreview]);

  const handleStickerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] || null;
    if (!file) return;
    if (newStickerPreview) URL.revokeObjectURL(newStickerPreview);
    setNewStickerFile(file);
    setNewStickerPreview(URL.createObjectURL(file));
    e.target.value = '';
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!newStickerFile) throw new Error('No file selected');
      const name = newStickerName.trim();
      if (!name) throw new Error('Sticker name is required');

      const fd = new FormData();
      fd.append('file', newStickerFile);
      fd.append('name', name);
      if (newStickerTags.trim()) fd.append('tags', newStickerTags.trim());
      const res = await userStickerApi.createMine(fd);
      return res.data as Sticker;
    },
    onSuccess: (sticker) => {
      toast.success('Sticker uploaded');
      queryClient.setQueryData(['userStickers', 'me'], (old: Sticker[] | undefined) => {
        const prev = Array.isArray(old) ? old : [];
        if (prev.some(s => s._id === sticker._id)) return prev;
        return [sticker, ...prev];
      });
      setNewStickerFile(null);
      if (newStickerPreview) URL.revokeObjectURL(newStickerPreview);
      setNewStickerPreview(null);
      setNewStickerName('');
      setNewStickerTags('');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to upload sticker');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { stickerId: string; name: string; tags: string; description: string }) => {
      const res = await userStickerApi.updateMine(input.stickerId, {
        name: input.name,
        description: input.description?.trim() ? input.description.trim() : null,
        tags: parseTags(input.tags),
      });
      return res.data as Sticker;
    },
    onSuccess: (sticker) => {
      toast.success('Sticker updated');
      queryClient.setQueryData(['userStickers', 'me'], (old: Sticker[] | undefined) => {
        const prev = Array.isArray(old) ? old : [];
        return prev.map(s => (s._id === sticker._id ? sticker : s));
      });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to update sticker');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (stickerId: string) => {
      await userStickerApi.removeMine(stickerId);
      return stickerId;
    },
    onSuccess: (stickerId) => {
      toast.success('Sticker deleted');
      queryClient.setQueryData(['userStickers', 'me'], (old: Sticker[] | undefined) => {
        const prev = Array.isArray(old) ? old : [];
        return prev.filter(s => s._id !== stickerId);
      });
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.message || err?.message || 'Failed to delete sticker');
    },
  });

  return (
    <div className="h-full flex flex-col p-4 md:p-0 overflow-hidden">
      <div className="pb-4 border-b border-[#3F4147] shrink-0">
        <h2 className="text-xl font-bold text-white mb-2">Stickers</h2>
        <p className="text-sm text-mew-textMuted">Upload and manage your personal stickers. You can use them in DMs and servers.</p>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar py-6 space-y-8">
        {/* Upload Section */}
        <div>
          <div className="flex gap-4 items-start">
            <div
              onClick={() => inputRef.current?.click()}
              className={clsx(
                'w-24 h-24 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors shrink-0',
                'border-[#4E5058] hover:border-mew-textMuted bg-[#1E1F22] hover:bg-[#232428]'
              )}
            >
              <input
                type="file"
                ref={inputRef}
                className="hidden"
                accept="image/png,image/gif,image/webp"
                onChange={handleStickerSelect}
                disabled={createMutation.isPending}
              />
              {newStickerPreview ? (
                <img src={newStickerPreview} className="w-full h-full object-contain p-1" />
              ) : (
                <>
                  <Icon icon="mdi:plus" className="text-mew-textMuted mb-1" width="24" />
                  <span className="text-[10px] font-bold text-mew-textMuted uppercase">Upload</span>
                </>
              )}
            </div>

            <div className="flex-1 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-mew-textMuted uppercase mb-1 block">Sticker Name</label>
                  <input
                    value={newStickerName}
                    onChange={e => setNewStickerName(e.target.value)}
                    className="w-full bg-[#1E1F22] text-white p-2 rounded text-sm outline-none focus:ring-1 focus:ring-mew-accent transition-all"
                    placeholder="Give it a name"
                    disabled={createMutation.isPending}
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-mew-textMuted uppercase mb-1 block">Related Emoji / Tags</label>
                  <input
                    value={newStickerTags}
                    onChange={e => setNewStickerTags(e.target.value)}
                    className="w-full bg-[#1E1F22] text-white p-2 rounded text-sm outline-none focus:ring-1 focus:ring-mew-accent transition-all"
                    placeholder="e.g. :wave:"
                    disabled={createMutation.isPending}
                  />
                </div>
              </div>
              <button
                onClick={() => createMutation.mutate()}
                disabled={!newStickerFile || !newStickerName.trim() || createMutation.isPending}
                className={clsx(
                  'px-4 py-2 rounded text-sm font-semibold transition-colors flex items-center justify-center gap-2 w-full sm:w-auto',
                  !newStickerFile || !newStickerName.trim() || createMutation.isPending
                    ? 'bg-[#4E5058] text-[#B5BAC1] cursor-not-allowed'
                    : 'bg-mew-accent text-white hover:bg-mew-accentHover'
                )}
              >
                {createMutation.isPending ? <Icon icon="mdi:loading" className="animate-spin" width="18" /> : null}
                Upload Sticker
              </button>
            </div>
          </div>
        </div>

        {/* Existing Stickers */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-mew-textMuted uppercase">{stickers.length} Stickers</h3>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-10">
              <Icon icon="mdi:loading" className="animate-spin text-mew-textMuted" width="28" />
            </div>
          ) : stickers.length === 0 ? (
            <div className="text-center py-10 text-mew-textMuted text-sm">No stickers yet.</div>
          ) : (
            <div className="space-y-2">
              {stickers.map((s) => {
                const draft = drafts[s._id] || { name: s.name || '', tags: (s.tags || []).join(' '), description: s.description || '' };
                return (
                  <div
                    key={s._id}
                    className="group flex items-center gap-4 bg-[#1E1F22] rounded-lg p-3 hover:bg-[#232428] transition-colors"
                  >
                    <div className="w-12 h-12 bg-[#2B2D31] rounded-md flex items-center justify-center shrink-0 overflow-hidden">
                      <img src={s.url} alt={s.name} className="w-full h-full object-contain p-1" />
                    </div>

                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3 min-w-0">
                      <div>
                        <input
                          value={draft.name}
                          onChange={(e) => setDrafts(prev => ({ ...prev, [s._id]: { ...draft, name: e.target.value } }))}
                          className="bg-transparent text-white font-medium text-sm w-full outline-none border-b border-transparent focus:border-mew-accent transition-colors placeholder-mew-textMuted/50"
                          placeholder="Name"
                        />
                      </div>
                      <div>
                        <input
                          value={draft.tags}
                          onChange={(e) => setDrafts(prev => ({ ...prev, [s._id]: { ...draft, tags: e.target.value } }))}
                          className="bg-transparent text-mew-textMuted text-sm w-full outline-none border-b border-transparent focus:border-mew-accent transition-colors placeholder-mew-textMuted/50"
                          placeholder="Tags"
                        />
                      </div>
                      <div className="sm:col-span-2">
                        <input
                          value={draft.description}
                          onChange={(e) => setDrafts(prev => ({ ...prev, [s._id]: { ...draft, description: e.target.value } }))}
                          className="bg-transparent text-mew-textMuted text-sm w-full outline-none border-b border-transparent focus:border-mew-accent transition-colors placeholder-mew-textMuted/50"
                          placeholder="Description (optional)"
                        />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => updateMutation.mutate({ stickerId: s._id, ...draft })}
                        disabled={updateMutation.isPending}
                        className="p-1.5 text-mew-textMuted hover:text-green-400 hover:bg-[#202225] rounded transition-colors"
                        title="Save Changes"
                      >
                        <Icon icon="mdi:check" width="20" />
                      </button>
                      <button
                        onClick={() =>
                          openModal('confirm', {
                            title: `Delete sticker '${s.name}'`,
                            description: 'Are you sure you want to delete this sticker? This cannot be undone.',
                            onConfirm: () => deleteMutation.mutate(s._id),
                          })
                        }
                        disabled={deleteMutation.isPending}
                        className="p-1.5 text-mew-textMuted hover:text-red-400 hover:bg-[#202225] rounded transition-colors"
                        title="Delete Sticker"
                      >
                        <Icon icon="mdi:trash-can-outline" width="20" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default UserStickerPanel;

