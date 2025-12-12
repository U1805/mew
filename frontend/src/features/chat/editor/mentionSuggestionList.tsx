import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import clsx from 'clsx';

export type MentionSuggestionItem = {
  id: string;
  label: string;
  isGlobal?: boolean;
  avatarUrl?: string;
};

type MentionListProps = {
  items: MentionSuggestionItem[];
  command: (item: { id: string; label?: string }) => void;
};

type KeyDownProps = {
  event: KeyboardEvent;
};

const MentionSuggestionList = forwardRef(function MentionSuggestionList(
  { items, command }: MentionListProps,
  ref,
) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const selectItem = (index: number) => {
    const item = items[index];
    if (!item) return;
    command({ id: item.id, label: item.label });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: KeyDownProps) => {
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : items.length - 1));
        return true;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSelectedIndex((prev) => (prev < items.length - 1 ? prev + 1 : 0));
        return true;
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        selectItem(selectedIndex);
        return true;
      }

      return false;
    },
  }));

  if (!items.length) {
    return null;
  }

  return (
    <div className="w-64 bg-[#2B2D31] rounded-md shadow-xl border border-[#1E1F22] overflow-hidden">
      <div className="text-xs font-bold text-mew-textMuted uppercase px-3 py-2 bg-[#1E1F22]">
        Members
      </div>
      <div className="max-h-[200px] overflow-y-auto custom-scrollbar p-1">
        {items.map((item, index) => (
          <div
            key={`${item.id}-${index}`}
            onClick={() => selectItem(index)}
            className={clsx(
              'flex items-center px-2 py-1.5 rounded cursor-pointer',
              index === selectedIndex ? 'bg-[#404249] text-white' : 'text-[#B5BAC1] hover:bg-[#35373C]',
            )}
          >
            {item.isGlobal ? (
              <div className="w-6 h-6 rounded-full bg-mew-textMuted/40 flex items-center justify-center mr-2 flex-shrink-0">
                <span className="font-bold text-mew-accent">@</span>
              </div>
            ) : (
              <div className="w-6 h-6 rounded-full bg-mew-accent flex items-center justify-center mr-2 overflow-hidden flex-shrink-0">
                {item.avatarUrl ? (
                  <img
                    src={item.avatarUrl}
                    alt={item.label}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-[10px] font-bold text-white">
                    {item.label.substring(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
            )}
            <span className="truncate font-medium text-sm">{item.label}</span>
            {item.isGlobal ? (
              <span className="ml-2 text-xs text-mew-textMuted truncate">
                Notify everyone online or all members
              </span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
});

export default MentionSuggestionList;
