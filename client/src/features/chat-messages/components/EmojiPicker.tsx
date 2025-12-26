import React from 'react';

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
      {/* Backdrop to close when clicking outside */}
      <div className="fixed inset-0 z-40" onClick={onClose}></div>
      
      <div className="absolute right-0 top-8 z-50 bg-[#2B2D31] border border-[#1E1F22] rounded-lg shadow-xl p-2 w-[180px] animate-scale-in origin-top-right">
        <div className="grid grid-cols-5 gap-1">
          {PRESET_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className="w-8 h-8 flex items-center justify-center hover:bg-[#404249] rounded transition-colors text-lg"
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
