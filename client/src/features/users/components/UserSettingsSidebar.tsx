import React from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { SidebarItem } from './UserSettingsSidebarItem';

export const UserSettingsSidebar: React.FC<{
  activeTab: string;
  mobileMenuOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  onTabClick: (tab: string) => void;
}> = ({ activeTab, mobileMenuOpen, onClose, onLogout, onTabClick }) => {
  return (
    <div
      className={clsx(
        'w-full md:w-[35%] md:min-w-[218px] bg-[#2B2D31] flex-col md:items-end pt-4 md:pt-[60px] pb-4 px-2 overflow-y-auto z-10 custom-scrollbar',
        mobileMenuOpen ? 'flex' : 'hidden md:flex'
      )}
    >
      <div className="w-full md:w-[192px] px-4 md:px-1.5">
        <div className="flex md:hidden items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Settings</h2>
          <button onClick={onClose} className="p-2 text-mew-textMuted hover:text-white">
            <Icon icon="mdi:close" width="24" />
          </button>
        </div>

        <div className="text-xs font-bold text-mew-textMuted uppercase px-2.5 mb-1.5 mt-2">User Settings</div>

        <SidebarItem label="My Account" isActive={activeTab === 'account'} onClick={() => onTabClick('account')} />
        <SidebarItem label="Profiles" />
        <SidebarItem label="Stickers" isActive={activeTab === 'stickers'} onClick={() => onTabClick('stickers')} />
        <SidebarItem label="Plugins" isActive={activeTab === 'plugins'} onClick={() => onTabClick('plugins')} />
        <SidebarItem label="Bots" isActive={activeTab === 'bots'} onClick={() => onTabClick('bots')} />
        <SidebarItem label="Privacy & Safety" />
        <SidebarItem label="Family Center" />
        <SidebarItem label="Authorized Apps" />
        <SidebarItem label="Devices" />
        <SidebarItem label="Connections" />
        <SidebarItem label="Friend Requests" />

        <div className="h-[1px] bg-mew-divider my-2 mx-2 opacity-50" />

        <div className="text-xs font-bold text-mew-textMuted uppercase px-2.5 mb-1.5 mt-2">App Settings</div>
        <SidebarItem label="Appearance" />
        <SidebarItem label="Accessibility" />
        <SidebarItem label="Voice & Video" />
        <SidebarItem label="Text & Images" />
        <SidebarItem label="Notifications" isActive={activeTab === 'notifications'} onClick={() => onTabClick('notifications')} />

        <div className="h-[1px] bg-mew-divider my-2 mx-2 opacity-50" />

        <button
          onClick={onLogout}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-white cursor-pointer group mb-1 text-left"
        >
          <span className="font-medium text-red-400 group-hover:text-red-500">Log Out</span>
          <Icon icon="mdi:logout" className="text-mew-textMuted group-hover:text-red-500" width="16" />
        </button>
      </div>
    </div>
  );
};

