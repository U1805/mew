import React from 'react';

interface TimestampDividerProps {
  timestamp: string;
}

const TimestampDivider: React.FC<TimestampDividerProps> = ({ timestamp }) => {
  return (
    <div className="relative my-4">
      <div
        className="absolute inset-0 flex items-center"
        aria-hidden="true"
      >
        <div className="w-full border-t border-mew-textMuted/20" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-mew-dark px-2 text-xs text-mew-textMuted">
          {timestamp}
        </span>
      </div>
    </div>
  );
};

export default TimestampDivider;
