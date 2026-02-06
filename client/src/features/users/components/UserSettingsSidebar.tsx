import React from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import { SidebarItem } from './UserSettingsSidebarItem';
import type { SettingsTab } from '../../../shared/router/settingsRoute';
import { useI18n } from '../../../shared/i18n';

export const UserSettingsSidebar: React.FC<{
  activeTab: SettingsTab;
  mobileMenuOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  onTabClick: (tab: SettingsTab) => void;
}> = ({ activeTab, mobileMenuOpen, onClose, onLogout, onTabClick }) => {
  const { t } = useI18n();

  return (
    <div
      className={clsx(
        'w-full md:w-[35%] md:min-w-[218px] bg-[#2B2D31] flex-col md:items-end pt-4 md:pt-[60px] pb-4 px-2 overflow-y-auto z-10 custom-scrollbar settings-sidebar-enter',
        mobileMenuOpen ? 'flex' : 'hidden md:flex'
      )}
    >
      <div className="w-full md:w-[192px] px-4 md:px-1.5">
        <div className="flex md:hidden items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">{t('settings.title')}</h2>
          <button onClick={onClose} className="p-2 text-mew-textMuted hover:text-white">
            <Icon icon="mdi:close" width="24" />
          </button>
        </div>

        <div className="text-xs font-bold text-mew-textMuted uppercase px-2.5 mb-1.5 mt-2">{t('settings.userSettings')}</div>

        <SidebarItem label={t('settings.myAccount')} isActive={activeTab === 'account'} onClick={() => onTabClick('account')} />
        <SidebarItem label={t('settings.profiles')} />
        <SidebarItem label={t('settings.stickers')} isActive={activeTab === 'stickers'} onClick={() => onTabClick('stickers')} />
        <SidebarItem label={t('settings.privacySafety')} />
        <SidebarItem label={t('settings.familyCenter')} />
        <SidebarItem label={t('settings.authorizedApps')} />
        <SidebarItem label={t('settings.devices')} />
        <SidebarItem label={t('settings.connections')} />
        <SidebarItem label={t('settings.friendRequests')} />

        <div className="h-[1px] bg-mew-divider my-2 mx-2 opacity-50" />

        <div className="text-xs font-bold text-mew-textMuted uppercase px-2.5 mb-1.5 mt-2">{t('settings.appSettings')}</div>
        <SidebarItem label={t('settings.appearance')} />
        <SidebarItem label={t('settings.accessibility')} />
        <SidebarItem label={t('settings.voiceVideo')} />
        <SidebarItem label={t('settings.textImages')} />
        <SidebarItem label={t('settings.notifications')} isActive={activeTab === 'notifications'} onClick={() => onTabClick('notifications')} />
        <SidebarItem label={t('settings.bots')} isActive={activeTab === 'bots' || activeTab === 'plugins'} onClick={() => onTabClick('bots')} />

        <div className="h-[1px] bg-mew-divider my-2 mx-2 opacity-50" />

        <button
          onClick={onLogout}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-white cursor-pointer group mb-1 text-left"
        >
          <span className="font-medium text-red-400 group-hover:text-red-500">{t('settings.logOut')}</span>
          <Icon icon="mdi:logout" className="text-mew-textMuted group-hover:text-red-500" width="16" />
        </button>
      </div>
    </div>
  );
};

