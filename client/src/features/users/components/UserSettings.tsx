import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useUIStore, useNotificationSettingsStore } from '../../../shared/stores';
import { useAuthStore } from '../../../shared/stores/authStore';
import { userApi } from '../../../shared/services/api';
import { getApiErrorMessage } from '../../../shared/utils/apiError';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { EditDisplayNameModal } from '../modals/EditDisplayNameModal';
import { ChangePasswordModal } from '../modals/ChangePasswordModal';
import { BotManagementPanel } from './BotManagementPanel';
import { UserStickerPanel } from './UserStickerPanel';
import { UserSettingsSidebar } from './UserSettingsSidebar';
import { UserSettingsAccountTab } from './UserSettingsAccountTab';
import { UserSettingsNotificationsTab } from './UserSettingsNotificationsTab';
import { UserSettingsVoiceVideoTab } from './UserSettingsVoiceVideoTab';
import type { SettingsTab } from '../../../shared/router/settingsRoute';
import { useI18n } from '../../../shared/i18n';
import { useVoiceSettingsStore } from '../../../shared/stores/voiceSettingsStore';

const UserSettings: React.FC = () => {
    const { t } = useI18n();
    const { isSettingsOpen, closeSettings, settingsTab: activeTab, selectSettingsTab } = useUIStore();
    const { user, logout, setUser, status } = useAuthStore();
    const notif = useNotificationSettingsStore((s) => s.user);
    const setNotif = useNotificationSettingsStore((s) => s.setUserSettings);
    const voiceSettings = useVoiceSettingsStore((s) => s.settings);
    const updateVoiceSettings = useVoiceSettingsStore((s) => s.updateSettings);

    const [mobileMenuOpen, setMobileMenuOpen] = useState(true);

    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isUploading, setIsUploading] = useState(false);
    const [pendingFile, setPendingFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [isEditUsernameModalOpen, setIsEditUsernameModalOpen] = useState(false);
    const [isUpdatingUsername, setIsUpdatingUsername] = useState(false);
    const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [isUpdatingNotifications, setIsUpdatingNotifications] = useState(false);
    const [displayedTab, setDisplayedTab] = useState<SettingsTab>(activeTab);
    const [tabTransition, setTabTransition] = useState<'idle' | 'out' | 'in'>('idle');
    const [tabDirection, setTabDirection] = useState<'forward' | 'backward'>('forward');

    useEffect(() => {
        if (!isSettingsOpen) return;
        const tabOrder: SettingsTab[] = ['account', 'stickers', 'notifications', 'voiceVideo', 'bots', 'plugins'];
        if (activeTab === displayedTab) return;

        const currentIndex = tabOrder.indexOf(displayedTab);
        const nextIndex = tabOrder.indexOf(activeTab);
        const isForward = nextIndex >= currentIndex;

        setTabDirection(isForward ? 'forward' : 'backward');
        setTabTransition('out');

        const switchTimer = window.setTimeout(() => {
            setDisplayedTab(activeTab);
            setTabTransition('in');
        }, 140);

        const settleTimer = window.setTimeout(() => {
            setTabTransition('idle');
        }, 320);

        return () => {
            window.clearTimeout(switchTimer);
            window.clearTimeout(settleTimer);
        };
    }, [activeTab, displayedTab, isSettingsOpen]);

    useEffect(() => {
        if (!isSettingsOpen) return;
        setDisplayedTab(activeTab);
        setTabTransition('idle');
    }, [isSettingsOpen]);

    if (!isSettingsOpen) return null;

    const handleLogout = () => {
        logout();
        closeSettings();
    };

    const handleAvatarClick = () => {
        if (isUploading) return;
        fileInputRef.current?.click();
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 50 * 1024 * 1024) {
            toast.error(t('toast.imageSizeLimit'));
            return;
        }

        setPendingFile(file);
        setPreviewUrl(URL.createObjectURL(file));
        e.target.value = '';
    };

    const cancelUpload = () => {
        setPendingFile(null);
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            setPreviewUrl(null);
        }
    };

    const confirmUpload = async () => {
        if (!pendingFile) return;

        const formData = new FormData();
        formData.append('avatar', pendingFile);

        setIsUploading(true);
        try {
            const res = await userApi.updateProfile(formData);
            setUser(res.data);
            toast.success(t('toast.avatarUpdated'));
            cancelUpload();
        } catch (error) {
            console.error(error);
            toast.error(getApiErrorMessage(error, t('toast.updateAvatarFailed')));
        } finally {
            setIsUploading(false);
        }
    };

    const handleSaveUsername = async (newUsername: string) => {
        if (!newUsername.trim() || newUsername.trim() === user?.username) {
            return;
        }
        setIsUpdatingUsername(true);
        try {
            const res = await userApi.updateProfile({ username: newUsername.trim() });
            setUser(res.data);
            toast.success(t('toast.usernameUpdated'));
            setIsEditUsernameModalOpen(false);
        } catch (error) {
            console.error(error);
            toast.error(getApiErrorMessage(error, t('toast.updateUsernameFailed')));
        } finally {
            setIsUpdatingUsername(false);
        }
    };

    const handleSavePassword = async (passwords: { oldPassword, newPassword }) => {
        setIsUpdatingPassword(true);
        try {
            await userApi.changePassword(passwords);
            toast.success(t('toast.passwordUpdated'));
            setIsChangePasswordModalOpen(false);
        } catch (error) {
            console.error(error);
            const message = getApiErrorMessage(error, t('toast.updatePasswordFailed'));
            toast.error(message);
            throw new Error(message);
        } finally {
            setIsUpdatingPassword(false);
        }
    };

    const persistNotificationSettings = async (next: Partial<typeof notif>) => {
        if (status !== 'authenticated' || !user) return;
        setIsUpdatingNotifications(true);
        try {
            const res = await userApi.updateNotificationSettings(next);
            const settings = res.data as { soundEnabled: boolean; soundVolume: number; desktopEnabled: boolean };
            setNotif(settings);
            setUser({ ...user, notificationSettings: settings });
        } catch (error) {
            toast.error(getApiErrorMessage(error, t('toast.updateNotificationFailed')));
            throw error;
        } finally {
            setIsUpdatingNotifications(false);
        }
    };

    const handleTabClick = (tab: SettingsTab) => {
        selectSettingsTab(tab);
        setMobileMenuOpen(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col md:flex-row bg-[#313338] animate-fade-in settings-shell-enter text-mew-text font-sans selection:bg-mew-accent selection:text-white">

            {/* Sidebar (Left) */}
            <UserSettingsSidebar
                activeTab={activeTab}
                mobileMenuOpen={mobileMenuOpen}
                onClose={closeSettings}
                onLogout={handleLogout}
                onTabClick={handleTabClick}
            />

            {/* Main Content (Center) */}
            <div className={clsx(
                "flex-1 bg-[#313338] flex flex-col h-full min-w-0", // min-w-0 prevents flex items from overflowing
                "settings-main-enter",
                !mobileMenuOpen ? "flex" : "hidden md:flex"
            )}>

                {/* Mobile Header */}
                <div className="md:hidden h-14 flex items-center px-4 bg-[#313338] border-b border-[#26272D] sticky top-0 z-20 shrink-0">
                    <button
                        onClick={() => setMobileMenuOpen(true)}
                        className="mr-4 text-mew-textMuted hover:text-white"
                    >
                        <Icon icon="mdi:arrow-left" width="24" />
                    </button>
                    <span key={activeTab} className="font-bold text-lg text-white capitalize animate-fade-in">
                        {activeTab === 'account' ? t('settings.myAccount') : t(`settings.${activeTab}`)}
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto discord-scrollbar px-4 md:px-10 pt-4 md:pt-[60px] pb-10">
                    <div
                        className={clsx(
                            "max-w-full md:max-w-[740px]",
                            tabTransition === 'out' && tabDirection === 'forward' && 'settings-tab-out-left',
                            tabTransition === 'out' && tabDirection === 'backward' && 'settings-tab-out-right',
                            tabTransition === 'in' && tabDirection === 'forward' && 'settings-tab-in-right',
                            tabTransition === 'in' && tabDirection === 'backward' && 'settings-tab-in-left'
                        )}
                    >
                        {displayedTab === 'account' && (
                            <UserSettingsAccountTab
                                user={user}
                                isUploading={isUploading}
                                fileInputRef={fileInputRef}
                                onAvatarClick={handleAvatarClick}
                                onAvatarFileChange={handleFileChange}
                                onEditDisplayName={() => setIsEditUsernameModalOpen(true)}
                                onChangePassword={() => setIsChangePasswordModalOpen(true)}
                            />
                        )}

                        {(displayedTab === 'bots' || displayedTab === 'plugins') && <BotManagementPanel />}
                        {displayedTab === 'stickers' && <UserStickerPanel />}

                        {displayedTab === 'notifications' && (
                            <UserSettingsNotificationsTab
                                notif={notif}
                                isUpdatingNotifications={isUpdatingNotifications}
                                setNotif={setNotif}
                                persistNotificationSettings={persistNotificationSettings}
                            />
                        )}

                        {displayedTab === 'voiceVideo' && (
                            <UserSettingsVoiceVideoTab settings={voiceSettings} onUpdate={updateVoiceSettings} />
                        )}
                    </div>
                </div>
            </div>

            {/* Close Button Column (Right) - Desktop Only */}
            <div className="hidden md:block w-[18%] min-w-[60px] max-w-[200px] pt-[60px] pl-5 settings-close-enter">
                <div
                    className="flex flex-col items-center cursor-pointer group sticky top-[60px]"
                    onClick={closeSettings}
                >
                    <div className="w-9 h-9 rounded-full border-[2px] border-mew-textMuted group-hover:bg-mew-textMuted/20 flex items-center justify-center transition-colors mb-1">
                        <Icon icon="mdi:close" className="text-mew-textMuted group-hover:text-white" width="24" height="24" />
                    </div>
                    <span className="text-xs font-bold text-mew-textMuted group-hover:text-white transition-colors">{t('settings.esc')}</span>
                </div>
            </div>

            {pendingFile && (
                <ConfirmModal
                    title={t('confirm.changeAvatarTitle')}
                    description={t('confirm.changeAvatarDesc')}
                    onConfirm={confirmUpload}
                    onCancel={cancelUpload}
                    confirmText={t('common.apply')}
                    isLoading={isUploading}
                    isDestructive={false}
                >
                    <div className="flex justify-center my-6">
                        <div className="w-32 h-32 rounded-full overflow-hidden ring-4 ring-mew-accent/50 shadow-xl">
                            <img src={previewUrl || ''} className="w-full h-full object-cover" alt={t('modal.preview')} />
                        </div>
                    </div>
                </ConfirmModal>
            )}

            <EditDisplayNameModal
                isOpen={isEditUsernameModalOpen}
                onClose={() => setIsEditUsernameModalOpen(false)}
                onSave={handleSaveUsername}
                currentUsername={user?.username || ''}
                isLoading={isUpdatingUsername}
            />

            <ChangePasswordModal
                isOpen={isChangePasswordModalOpen}
                onClose={() => setIsChangePasswordModalOpen(false)}
                onSave={handleSavePassword}
                isLoading={isUpdatingPassword}
            />
        </div>
    );
};

export default UserSettings;

