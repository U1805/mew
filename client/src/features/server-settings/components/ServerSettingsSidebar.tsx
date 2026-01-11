import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { SidebarItem } from './ServerSettingsSidebarItem';

export type ServerSettingsTab = 'overview' | 'roles' | 'emoji' | 'stickers';

export const ServerSettingsSidebar: React.FC<{
  activeTab: ServerSettingsTab;
  mobileMenuOpen: boolean;
  onClose: () => void;
  onTabClick: (tab: ServerSettingsTab) => void;
  onDeleteServer: () => void;
}> = ({ activeTab, mobileMenuOpen, onClose, onTabClick, onDeleteServer }) => {
  return (
    <div
      className={clsx(
        'w-full md:w-[30%] md:min-w-[220px] bg-[#2B2D31] flex-col md:items-end pt-4 md:pt-[60px] pb-4 px-2 z-10',
        'absolute inset-0 md:static transition-transform duration-300 ease-ios will-change-transform',
        !mobileMenuOpen
          ? '-translate-x-[20%] opacity-0 pointer-events-none md:translate-x-0 md:opacity-100 md:pointer-events-auto md:flex'
          : 'translate-x-0 flex'
      )}
    >
      <div className="w-full md:w-[192px] px-4 md:px-1.5">
        <div className="flex md:hidden items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Server Settings</h2>
          <button onClick={onClose} className="p-2 text-mew-textMuted hover:text-white">
            <Icon icon="mdi:close" width="24" />
          </button>
        </div>
        <h2 className="text-xs font-bold text-mew-textMuted uppercase mb-3 px-2.5 hidden md:block">Server Settings</h2>
        <SidebarItem label="Overview" isActive={activeTab === 'overview'} onClick={() => onTabClick('overview')} />
        <SidebarItem label="Roles" isActive={activeTab === 'roles'} onClick={() => onTabClick('roles')} />
        <SidebarItem label="Emoji" isActive={activeTab === 'emoji'} onClick={() => onTabClick('emoji')} />
        <SidebarItem label="Stickers" isActive={activeTab === 'stickers'} onClick={() => onTabClick('stickers')} />
        <div className="h-[1px] bg-mew-divider my-2 mx-2 opacity-50" />
        <div
          className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] font-medium text-sm cursor-pointer mb-0.5 flex justify-between group text-red-400"
          onClick={onDeleteServer}
        >
          <span>Delete Server</span>
          <Icon icon="mdi:trash-can-outline" />
        </div>
      </div>
    </div>
  );
};
