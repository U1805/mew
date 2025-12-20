import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface HiddenState {
  hiddenDmChannelIds: Set<string>;
  addHiddenChannel: (channelId: string) => void;
  removeHiddenChannel: (channelId: string) => void;
}

export const useHiddenStore = create<HiddenState>()(
  persist(
    (set, get) => ({
      hiddenDmChannelIds: new Set(),
      addHiddenChannel: (channelId) => {
        if (get().hiddenDmChannelIds.has(channelId)) return;
        set((state) => {
          const newSet = new Set(state.hiddenDmChannelIds);
          newSet.add(channelId);
          return { hiddenDmChannelIds: newSet };
        });
      },
      removeHiddenChannel: (channelId) => {
        if (!get().hiddenDmChannelIds.has(channelId)) return;
        set((state) => {
          const newSet = new Set(state.hiddenDmChannelIds);
          newSet.delete(channelId);
          return { hiddenDmChannelIds: newSet };
        });
      },
    }),
    {
      name: 'mew-hidden-channels-storage',
      storage: createJSONStorage(() => localStorage, {
        reviver: (key, value) => {
          if (key === 'hiddenDmChannelIds' && typeof value === 'object' && value !== null && !Array.isArray(value)) {
            // Zustand's persist middleware for Sets
            return new Set((value as any).value);
          }
          return value;
        },
        replacer: (key, value) => {
          if (key === 'hiddenDmChannelIds' && value instanceof Set) {
            return { value: Array.from(value) };
          }
          return value;
        },
      }),
      partialize: (state) => ({ hiddenDmChannelIds: state.hiddenDmChannelIds }),
    }
  )
);