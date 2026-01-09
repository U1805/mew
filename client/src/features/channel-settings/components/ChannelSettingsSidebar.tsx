import type { ReactNode } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';

export type ChannelSettingsTab = 'overview' | 'permissions' | 'integrations';

export const ChannelSettingsSidebar: React.FC<{
  title: ReactNode;
  activeTab: ChannelSettingsTab;
  mobileMenuOpen: boolean;
  onClose: () => void;
  onTabClick: (tab: ChannelSettingsTab) => void;
  onDelete: () => void;
  showIntegrations: boolean;
}> = ({ title, activeTab, mobileMenuOpen, onClose, onTabClick, onDelete, showIntegrations }) => {
  return (
    <div
      className={clsx(
        'w-full md:w-[30%] md:min-w-[220px] bg-[#2B2D31] flex-col md:items-end pt-4 md:pt-[60px] pb-4 px-2 z-10',
        mobileMenuOpen ? 'flex' : 'hidden md:flex'
      )}
    >
      <div className="w-full md:w-[192px] px-4 md:px-1.5">
        <div className="flex md:hidden items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Channel Settings</h2>
          <button onClick={onClose} className="p-2 text-mew-textMuted hover:text-white">
            <Icon icon="mdi:close" width="24" />
          </button>
        </div>

        <h2 className="text-xs font-bold text-mew-textMuted uppercase mb-3 px-2.5 hidden md:block">{title}</h2>

        <div
          className={clsx(
            'px-2.5 py-1.5 rounded-[4px] font-medium text-sm cursor-pointer mb-0.5 transition-colors',
            activeTab === 'overview' ? 'bg-[#404249] text-white' : 'text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text'
          )}
          onClick={() => onTabClick('overview')}
        >
          Overview
        </div>
        <div
          className={clsx(
            'px-2.5 py-1.5 rounded-[4px] font-medium text-sm cursor-pointer mb-0.5 transition-colors',
            activeTab === 'permissions' ? 'bg-[#404249] text-white' : 'text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text'
          )}
          onClick={() => onTabClick('permissions')}
        >
          Permissions
        </div>
        {showIntegrations && (
          <div
            className={clsx(
              'px-2.5 py-1.5 rounded-[4px] font-medium text-sm cursor-pointer mb-0.5 transition-colors',
              activeTab === 'integrations' ? 'bg-[#404249] text-white' : 'text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text'
            )}
            onClick={() => onTabClick('integrations')}
          >
            Integrations
          </div>
        )}

        <div className="h-[1px] bg-mew-divider my-2 mx-2 opacity-50" />

        <div
          className="px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text font-medium text-sm cursor-pointer mb-0.5 flex justify-between group"
          onClick={onDelete}
        >
          <span className="text-red-400">Delete Channel</span>
          <Icon icon="mdi:trash-can-outline" className="text-red-400" />
        </div>
      </div>
    </div>
  );
};
