import React from 'react';
import clsx from 'clsx';

export const SidebarItem: React.FC<{ label: string; isActive?: boolean; onClick?: () => void }> = ({ label, isActive, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'px-2.5 py-1.5 rounded-[4px] cursor-pointer mb-0.5 font-medium text-sm transition-colors',
        isActive ? 'bg-[#404249] text-gray-100' : 'text-mew-textMuted hover:bg-[#35373C] hover:text-gray-200'
      )}
    >
      {label}
    </div>
  );
};

