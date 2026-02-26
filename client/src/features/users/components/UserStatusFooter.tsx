import React from 'react';
import { Icon } from '@iconify/react';
import { useUIStore } from '../../../shared/stores';
import { useAuthStore } from '../../../shared/stores/authStore';
import { useI18n } from '../../../shared/i18n';

export const UserStatusFooter: React.FC = () => {
    const { user } = useAuthStore();
    const { openSettings } = useUIStore();
    const { t } = useI18n();

    return (
        <div className="h-[60px] bg-[#232428] flex items-center px-2 flex-shrink-0 z-10">
            <div className="w-8 h-8 rounded-full bg-mew-accent flex items-center justify-center mr-2 overflow-hidden hover:opacity-80 cursor-pointer group">
                {user?.avatarUrl ? (
                     <img src={user.avatarUrl} alt={t('sticker.manageMe')} className="w-full h-full object-cover" />
                ) : (
                    <Icon icon="mdi:user" className="text-white" />
                )}
            </div>
            <div className="flex-1 min-w-0 mr-2 group cursor-pointer" onClick={() => { /* Perhaps copy ID */ }}>
                <div className="text-sm font-semibold text-white truncate">{user?.username || t('userStatus.guest')}</div>
                <div className="text-xs text-mew-textMuted truncate group-hover:text-mew-text">#{user?.discriminator || '0000'}</div>
            </div>
            <div className="flex items-center">
                <button className="text-mew-textMuted hover:text-white p-1.5 rounded hover:bg-mew-dark transition-colors" title={t('userStatus.mute')}>
                    <Icon icon="mdi:microphone" width="20" />
                </button>
                <button className="text-mew-textMuted hover:text-white p-1.5 rounded hover:bg-mew-dark transition-colors" title={t('userStatus.deafen')}>
                    <Icon icon="mdi:headphones" width="20" />
                </button>
                <button
                    className="text-mew-textMuted hover:text-white p-1.5 rounded hover:bg-mew-dark transition-colors"
                    title={t('settings.userSettings')}
                    onClick={openSettings}
                >
                    <Icon icon="mdi:cog" width="20" />
                </button>
            </div>
        </div>
    );
};

