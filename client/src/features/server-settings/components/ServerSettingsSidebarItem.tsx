import clsx from 'clsx';

export const SidebarItem: React.FC<{ label: string; isActive?: boolean; onClick: () => void }> = ({ label, isActive, onClick }) => {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'px-2.5 py-1.5 rounded-[4px] cursor-pointer mb-0.5 font-medium text-sm transition-colors',
        isActive ? 'bg-[#404249] text-white' : 'text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text'
      )}
    >
      {label}
    </div>
  );
};
