import React, { useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useUIStore, useAuthStore, useNotificationSettingsStore } from '../../../shared/stores';
import { userApi } from '../../../shared/services/api';
import { getApiErrorMessage } from '../../../shared/utils/apiError';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';
import { EditDisplayNameModal } from '../modals/EditDisplayNameModal';
import { ChangePasswordModal } from '../modals/ChangePasswordModal';
import { BotManagementPanel } from './BotManagementPanel';
import { PluginManagementPanel } from './PluginManagementPanel';
import { UserStickerPanel } from './UserStickerPanel';
import { UserSettingsSidebar } from './UserSettingsSidebar';
import { UserSettingsAccountTab } from './UserSettingsAccountTab';
import { UserSettingsNotificationsTab } from './UserSettingsNotificationsTab';
import type { SettingsTab } from '../../../shared/router/settingsRoute';

const UserSettings: React.FC = () => {
    const { isSettingsOpen, closeSettings, settingsTab: activeTab, selectSettingsTab } = useUIStore();
    const { user, logout, setUser, status } = useAuthStore();
    const notif = useNotificationSettingsStore((s) => s.user);
    const setNotif = useNotificationSettingsStore((s) => s.setUserSettings);

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
            toast.error("Image size must be less than 50MB");
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
            toast.success("Avatar updated!");
            cancelUpload();
        } catch (error) {
            console.error(error);
            toast.error(getApiErrorMessage(error, 'Failed to update avatar'));
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
            toast.success("Username updated!");
            setIsEditUsernameModalOpen(false);
        } catch (error) {
            console.error(error);
            toast.error(getApiErrorMessage(error, 'Failed to update username'));
        } finally {
            setIsUpdatingUsername(false);
        }
    };

    const handleSavePassword = async (passwords: { oldPassword, newPassword }) => {
        setIsUpdatingPassword(true);
        try {
            await userApi.changePassword(passwords);
            toast.success("Password updated successfully!");
            setIsChangePasswordModalOpen(false);
        } catch (error) {
            console.error(error);
            const message = getApiErrorMessage(error, 'Failed to update password');
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
            toast.error(getApiErrorMessage(error, 'Failed to update notification settings'));
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
        <div className="fixed inset-0 z-50 flex flex-col md:flex-row bg-[#313338] animate-fade-in text-mew-text font-sans selection:bg-mew-accent selection:text-white">

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
                "flex-1 bg-[#313338] pt-0 md:pt-[60px] px-0 md:px-10 max-w-full md:max-w-[740px] overflow-y-auto custom-scrollbar flex flex-col h-full",
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
                    <span className="font-bold text-lg text-white capitalize">
                        {activeTab === 'account' ? 'My Account' : activeTab}
                    </span>
                </div>

                <div className="p-4 md:p-0 pb-10">
                    {activeTab === 'account' && (
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

                    {activeTab === 'plugins' && <PluginManagementPanel />}
                    {activeTab === 'bots' && <BotManagementPanel />}
                    {activeTab === 'stickers' && <UserStickerPanel />}

                    {/* 
                     * =========================================
                     * NOTIFICATION TAB (Updated & Discord-styled)
                     * =========================================
                     */}
                    {activeTab === 'notifications' && (
                        <UserSettingsNotificationsTab
                            notif={notif}
                            isUpdatingNotifications={isUpdatingNotifications}
                            setNotif={setNotif}
                            persistNotificationSettings={persistNotificationSettings}
                        />
                    )}
                </div>
            </div>

            {/* Close Button Column (Right) - Desktop Only */}
            <div className="hidden md:block w-[18%] min-w-[60px] pt-[60px] pl-5">
                <div
                    className="flex flex-col items-center cursor-pointer group"
                    onClick={closeSettings}
                >
                    <div className="w-9 h-9 rounded-full border-[2px] border-mew-textMuted group-hover:bg-mew-textMuted/20 flex items-center justify-center transition-colors mb-1">
                        <Icon icon="mdi:close" className="text-mew-textMuted group-hover:text-white" width="24" height="24" />
                    </div>
                    <span className="text-xs font-bold text-mew-textMuted group-hover:text-white transition-colors">ESC</span>
                </div>
            </div>

            {pendingFile && (
                <ConfirmModal
                    title="Change Avatar"
                    description="Are you sure you want to use this image as your new avatar?"
                    onConfirm={confirmUpload}
                    onCancel={cancelUpload}
                    confirmText="Apply"
                    isLoading={isUploading}
                    isDestructive={false}
                >
                    <div className="flex justify-center my-6">
                        <div className="w-32 h-32 rounded-full overflow-hidden ring-4 ring-mew-accent/50 shadow-xl">
                            <img src={previewUrl || ''} className="w-full h-full object-cover" alt="Preview" />
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
