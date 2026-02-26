import React from 'react';
import clsx from 'clsx';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}

// A subset of popular emojis for the MVP
const PRESET_EMOJIS = [
  '👍', '👎', '❤️', '🔥', '😂', '😮', '😢', '😡', '🎉', '👀', 
  '🚀', '💯', '🤔', '💀', '🤡', '✅', '❌', '👋', '🙏', '✨'
];

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, onClose }) => {
  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/0 md:bg-transparent" onClick={onClose}></div>
      
      {/* 
        Container:
        Mobile: Fixed centered or bottom (using fixed inset-x-0 bottom-0 or centered).
        Desktop: Absolute relative to parent.
      */}
      <div className={clsx(
        "z-50 bg-[#2B2D31] border border-[#1E1F22] rounded-lg shadow-xl p-2 animate-scale-in",
        // Desktop
        "md:absolute md:right-0 md:left-auto md:top-[calc(100%+6px)] md:w-[180px] md:origin-top-right md:translate-x-0 md:translate-y-0",
        // Mobile (Centered Modal style or Bottom Sheet)
        "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] origin-center"
      )}>
        <div className="grid grid-cols-5 gap-2 md:gap-1">
          {PRESET_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className="w-10 h-10 md:w-8 md:h-8 flex items-center justify-center hover:bg-[#404249] rounded transition-colors text-2xl md:text-lg"
              onClick={() => {
                onSelect(emoji);
                onClose();
              }}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>
    </>
  );
};
