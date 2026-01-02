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
import { playMessageSound, requestDesktopNotificationPermission, showDesktopNotification } from '../../../shared/services/notifications';

// Helper component for Discord-style Toggle Switch
const Switch: React.FC<{ checked: boolean; onChange: () => void; disabled?: boolean }> = ({ checked, onChange, disabled }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={clsx(
            "w-[40px] h-[24px] rounded-full p-[2px] transition-colors duration-200 ease-in-out flex items-center relative cursor-pointer",
            disabled ? "opacity-50 cursor-not-allowed" : "",
            checked ? "bg-[#23A559]" : "bg-[#80848E]" // Discord Green vs Gray
        )}
    >
        <span
            className={clsx(
                "block w-[20px] h-[20px] bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out",
                checked ? "translate-x-[16px]" : "translate-x-0"
            )}
        >
            {/* Optional: Add icons inside the toggle like X and Check if needed, Discord usually keeps it clean */}
        </span>
    </button>
);

const UserSettings: React.FC = () => {
    const { isSettingsOpen, closeSettings } = useUIStore();
    const { user, logout, setAuth, token } = useAuthStore();
    const notif = useNotificationSettingsStore((s) => s.user);
    const setNotif = useNotificationSettingsStore((s) => s.setUserSettings);

    const [activeTab, setActiveTab] = useState('account');
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
            const remember = !!localStorage.getItem('mew_token');
            setAuth(token!, res.data, remember);
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
            const remember = !!localStorage.getItem('mew_token');
            setAuth(token!, res.data, remember);
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
        if (!token || !user) return;
        setIsUpdatingNotifications(true);
        try {
            const res = await userApi.updateNotificationSettings(next);
            const settings = res.data as { soundEnabled: boolean; soundVolume: number; desktopEnabled: boolean };
            setNotif(settings);

            const remember = !!localStorage.getItem('mew_token');
            setAuth(token, { ...user, notificationSettings: settings }, remember);
        } catch (error) {
            toast.error(getApiErrorMessage(error, 'Failed to update notification settings'));
            throw error;
        } finally {
            setIsUpdatingNotifications(false);
        }
    };

    const handleTabClick = (tab: string) => {
        setActiveTab(tab);
        setMobileMenuOpen(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex flex-col md:flex-row bg-[#313338] animate-fade-in text-mew-text font-sans selection:bg-mew-accent selection:text-white">

            {/* Sidebar (Left) */}
            <div className={clsx(
                "w-full md:w-[35%] md:min-w-[218px] bg-[#2B2D31] flex-col md:items-end pt-4 md:pt-[60px] pb-4 px-2 overflow-y-auto z-10 custom-scrollbar",
                mobileMenuOpen ? "flex" : "hidden md:flex"
            )}>
                <div className="w-full md:w-[192px] px-4 md:px-1.5">
                    {/* Mobile Header */}
                    <div className="flex md:hidden items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-white">Settings</h2>
                        <button onClick={closeSettings} className="p-2 text-mew-textMuted hover:text-white">
                            <Icon icon="mdi:close" width="24" />
                        </button>
                    </div>

                    <div className="text-xs font-bold text-mew-textMuted uppercase px-2.5 mb-1.5 mt-2">User Settings</div>

                    <SidebarItem label="My Account" isActive={activeTab === 'account'} onClick={() => handleTabClick('account')} />
                    <SidebarItem label="Profiles" />
                    <SidebarItem label="Stickers" isActive={activeTab === 'stickers'} onClick={() => handleTabClick('stickers')} />
                    <SidebarItem label="Plugins" isActive={activeTab === 'plugins'} onClick={() => handleTabClick('plugins')} />
                    <SidebarItem label="Bots" isActive={activeTab === 'bots'} onClick={() => handleTabClick('bots')} />
                    <SidebarItem label="Privacy & Safety" />
                    <SidebarItem label="Family Center" />
                    <SidebarItem label="Authorized Apps" />
                    <SidebarItem label="Devices" />
                    <SidebarItem label="Connections" />
                    <SidebarItem label="Friend Requests" />

                    <div className="h-[1px] bg-mew-divider my-2 mx-2 opacity-50"></div>

                    <div className="text-xs font-bold text-mew-textMuted uppercase px-2.5 mb-1.5 mt-2">App Settings</div>
                    <SidebarItem label="Appearance" />
                    <SidebarItem label="Accessibility" />
                    <SidebarItem label="Voice & Video" />
                    <SidebarItem label="Text & Images" />
                    <SidebarItem label="Notifications" isActive={activeTab === 'notifications'} onClick={() => handleTabClick('notifications')} />

                    <div className="h-[1px] bg-mew-divider my-2 mx-2 opacity-50"></div>

                    <button
                        onClick={handleLogout}
                        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-[4px] text-mew-textMuted hover:bg-[#35373C] hover:text-white cursor-pointer group mb-1 text-left"
                    >
                        <span className="font-medium text-red-400 group-hover:text-red-500">Log Out</span>
                        <Icon icon="mdi:logout" className="text-mew-textMuted group-hover:text-red-500" width="16" />
                    </button>
                </div>
            </div>

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
                        <>
                            <h2 className="text-xl font-bold text-white mb-6 hidden md:block">My Account</h2>
                            <div className="bg-[#1E1F22] rounded-lg mb-8 overflow-hidden shadow-sm">
                                <div className="h-[100px] bg-mew-accent relative">
                                    <div className="absolute left-4 -bottom-[36px]">
                                        <div
                                            className="w-[80px] h-[80px] rounded-full p-[6px] bg-[#1E1F22] relative group cursor-pointer"
                                            onClick={handleAvatarClick}
                                        >
                                            <input
                                                type="file"
                                                ref={fileInputRef}
                                                className="hidden"
                                                accept="image/png, image/jpeg, image/gif"
                                                onChange={handleFileChange}
                                            />
                                            <div className="w-full h-full rounded-full overflow-hidden relative bg-[#1E1F22]">
                                                {user?.avatarUrl ? (
                                                    <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full bg-mew-accentHover flex items-center justify-center text-white text-2xl font-bold">
                                                        {user?.username?.slice(0, 2).toUpperCase()}
                                                    </div>
                                                )}
                                                <div className={clsx(
                                                    "absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity",
                                                    isUploading ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                                                )}>
                                                    {isUploading ? (
                                                        <Icon icon="mdi:loading" className="text-white animate-spin" width="24" />
                                                    ) : (
                                                        <span className="text-white text-[10px] font-bold uppercase tracking-wide">Change</span>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-green-500 border-[4px] border-[#1E1F22]"></div>
                                        </div>
                                    </div>
                                </div>

                                <div className="pt-12 pb-4 px-4">
                                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-4">
                                        <div>
                                            <h3 className="text-xl font-bold text-white">{user?.username}</h3>
                                            <p className="text-sm text-mew-textMuted">#{user?.discriminator || '0000'}</p>
                                        </div>
                                        <button
                                            onClick={handleAvatarClick}
                                            disabled={isUploading}
                                            className="bg-mew-accent hover:bg-mew-accentHover text-white px-4 py-1.5 rounded-[3px] text-sm font-medium transition-colors w-full sm:w-auto"
                                        >
                                            Edit User Profile
                                        </button>
                                    </div>

                                    <div className="bg-[#2B2D31] rounded-lg p-4 space-y-5">
                                        <div className="flex justify-between items-center">
                                            <div className="min-w-0 pr-2">
                                                <div className="text-xs font-bold text-mew-textMuted uppercase mb-1">Display Name</div>
                                                <div className="text-white text-sm font-medium truncate">{user?.username}</div>
                                            </div>
                                            <button onClick={() => setIsEditUsernameModalOpen(true)} className="bg-[#383A40] hover:bg-[#404249] text-white px-4 py-1.5 rounded-[3px] text-sm font-medium transition-colors shrink-0">
                                                Edit
                                            </button>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <div className="min-w-0 pr-2">
                                                <div className="text-xs font-bold text-mew-textMuted uppercase mb-1">Email</div>
                                                <div className="text-white text-sm font-medium truncate">
                                                    {user?.email ? user.email.replace(/(.{2})(.*)(@.*)/, "$1*****$3") : 'No Email'}
                                                </div>
                                            </div>
                                            <button className="bg-[#383A40] hover:bg-[#404249] text-white px-4 py-1.5 rounded-[3px] text-sm font-medium transition-colors shrink-0">
                                                Edit
                                            </button>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <div className="min-w-0 pr-2">
                                                <div className="text-xs font-bold text-mew-textMuted uppercase mb-1">Phone Number</div>
                                                <div className="text-mew-textMuted text-sm truncate">You haven&rsquo;t added a phone number yet.</div>
                                            </div>
                                            <button className="bg-[#383A40] hover:bg-[#404249] text-white px-4 py-1.5 rounded-[3px] text-sm font-medium transition-colors shrink-0">
                                                Add
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="h-[1px] bg-mew-divider my-8"></div>

                            <h3 className="text-lg font-bold text-white mb-4">Password and Authentication</h3>
                            <button onClick={() => setIsChangePasswordModalOpen(true)} className="bg-mew-accent hover:bg-mew-accentHover text-white px-4 py-2 rounded-[3px] text-sm font-medium transition-colors mb-2">
                                Change Password
                            </button>
                            <div className="text-xs text-mew-textMuted mt-4 mb-8">
                                <h4 className="font-bold uppercase mb-2">Two-Factor Authentication</h4>
                                <p className="mb-4 leading-5 text-[#B5BAC1]">Protect your account with an extra layer of security. Once configured, you&rsquo;ll be required to enter both your password and an authentication code from your mobile phone in order to sign in.</p>
                                <button className="bg-[#383A40] hover:bg-[#404249] text-white px-4 py-2 rounded-[3px] text-sm font-medium transition-colors">
                                    Enable Two-Factor Auth
                                </button>
                            </div>
                        </>
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
                        <div className="animate-in fade-in duration-300">
                            <h2 className="text-[20px] font-bold text-[#F2F3F5] mb-5 hidden md:block">Notifications</h2>

                            {/* Section: Sounds */}
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-xs font-bold text-[#B5BAC1] uppercase mb-3 tracking-wide">Sounds</h3>
                                    
                                    <div className="space-y-1">
                                        {/* Toggle: Enable Message Sounds */}
                                        <div className="flex items-center justify-between py-2 cursor-pointer group hover:bg-[#3F4147]/30 rounded px-1 -mx-1 transition-colors"
                                             onClick={async () => {
                                                if (isUpdatingNotifications) return;
                                                const newState = !notif.soundEnabled;
                                                await persistNotificationSettings({ soundEnabled: newState });
                                                if (newState) playMessageSound(notif.soundVolume);
                                            }}
                                        >
                                            <div className="flex-1 pr-4">
                                                <div className="text-[#F2F3F5] font-medium text-base mb-0.5 group-hover:underline decoration-1 underline-offset-2 decoration-[#F2F3F5]/0 group-hover:decoration-[#F2F3F5]/100 transition-all">
                                                    Message Sounds
                                                </div>
                                                <div className="text-sm text-[#B5BAC1]">Play a sound when you receive a new message.</div>
                                            </div>
                                            {/* Assuming Switch component accepts standard props. Ensure its colors match Discord (Green #23A559 when active) */}
                                            <Switch
                                                checked={notif.soundEnabled}
                                                disabled={isUpdatingNotifications}
                                                onChange={async () => {
                                                    const newState = !notif.soundEnabled;
                                                    await persistNotificationSettings({ soundEnabled: newState });
                                                    if (newState) playMessageSound(notif.soundVolume);
                                                }}
                                            />
                                        </div>

                                        <div className="h-[1px] bg-[#3F4147] my-4 w-full" />

                                        {/* Slider: Volume */}
                                        <div className={clsx("py-2 transition-opacity duration-300", !notif.soundEnabled && "opacity-50 pointer-events-none grayscale")}>
                                            <div className="flex items-center justify-between mb-3">
                                                <div>
                                                    <div className="text-[#F2F3F5] font-medium text-base mb-0.5">Sound Volume</div>
                                                    <div className="text-sm text-[#B5BAC1]">Controls the volume of message notifications.</div>
                                                </div>
                                            </div>
                                            
                                            <div className="flex items-center gap-4 pl-1">
                                                <Icon icon="mdi:volume-high" className="text-[#B5BAC1]" width="24" />
                                                
                                                <div className="relative w-full h-10 flex items-center group">
                                                    <input
                                                        type="range"
                                                        min={0}
                                                        max={100}
                                                        value={Math.round(notif.soundVolume * 100)}
                                                        disabled={!notif.soundEnabled || isUpdatingNotifications}
                                                        onChange={(e) => {
                                                            const v = Math.max(0, Math.min(100, Number(e.target.value)));
                                                            setNotif({ soundVolume: v / 100 });
                                                        }}
                                                        onMouseUp={async (e: any) => {
                                                            const v = Math.max(0, Math.min(100, Number(e.currentTarget.value)));
                                                            await persistNotificationSettings({ soundVolume: v / 100 });
                                                            playMessageSound(v / 100);
                                                        }}
                                                        onTouchEnd={async (e: any) => {
                                                            const v = Math.max(0, Math.min(100, Number(e.currentTarget.value)));
                                                            await persistNotificationSettings({ soundVolume: v / 100 });
                                                            playMessageSound(v / 100);
                                                        }}
                                                        // Discord Style Slider CSS
                                                        className={clsx(
                                                            "w-full h-[8px] rounded-lg appearance-none cursor-pointer focus:outline-none focus:ring-0",
                                                            // Thumb styles (The handle) - Discord style is a white pill/rounded rect
                                                            "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-[10px] [&::-webkit-slider-thumb]:h-[24px] [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-[3px] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-grab [&::-webkit-slider-thumb]:border-0",
                                                            "[&::-moz-range-thumb]:w-[10px] [&::-moz-range-thumb]:h-[24px] [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:rounded-[3px] [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-grab"
                                                        )}
                                                        style={{
                                                            // Dynamic background gradient to simulate "filled" track vs "empty" track
                                                            background: `linear-gradient(to right, #5865F2 0%, #5865F2 ${notif.soundVolume * 100}%, #4E5058 ${notif.soundVolume * 100}%, #4E5058 100%)`
                                                        }}
                                                    />
                                                </div>
                                                <div className="w-10 text-right text-sm font-medium text-[#F2F3F5] tabular-nums">
                                                    {Math.round(notif.soundVolume * 100)}%
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="h-[1px] bg-[#3F4147] w-full" />

                                {/* Section: Desktop Notifications */}
                                <div>
                                    <h3 className="text-xs font-bold text-[#B5BAC1] uppercase mb-3 tracking-wide">Desktop Options</h3>
                                    
                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between py-2 cursor-pointer group hover:bg-[#3F4147]/30 rounded px-1 -mx-1 transition-colors"
                                             onClick={async () => {
                                                if (notif.desktopEnabled) {
                                                    await persistNotificationSettings({ desktopEnabled: false });
                                                    return;
                                                }
                                                // Trigger the logic
                                                const perm = await requestDesktopNotificationPermission();
                                                if (perm !== 'granted') {
                                                    toast.error('Browser notification permission is not granted.');
                                                    await persistNotificationSettings({ desktopEnabled: false });
                                                    return;
                                                }
                                                await persistNotificationSettings({ desktopEnabled: true });
                                                showDesktopNotification({
                                                    title: 'Notifications Enabled',
                                                    body: 'You will now receive desktop notifications!',
                                                    tag: 'mew:enabled'
                                                });
                                             }}
                                        >
                                            <div className="flex-1 pr-4">
                                                <div className="text-[#F2F3F5] font-medium text-base mb-0.5 group-hover:underline decoration-1 underline-offset-2 decoration-[#F2F3F5]/0 group-hover:decoration-[#F2F3F5]/100 transition-all">
                                                    Enable Desktop Notifications
                                                </div>
                                                <div className="text-sm text-[#B5BAC1]">Show native browser notifications when Mew is not focused.</div>
                                            </div>
                                            <Switch
                                                checked={notif.desktopEnabled}
                                                disabled={isUpdatingNotifications}
                                                onChange={async () => {
                                                   // Logic handled in wrapper div for better UX, but keeping this just in case
                                                   // This is redundant if wrapper handles click, but good for accessibility
                                                }}
                                            />
                                        </div>

                                        {/* Test Button - Styled as Discord Secondary Button */}
                                        <div className="flex justify-start pt-1">
                                             <button
                                                disabled={!notif.desktopEnabled || typeof Notification === 'undefined' || Notification.permission !== 'granted'}
                                                onClick={() => {
                                                    if(notif.soundEnabled) playMessageSound(notif.soundVolume);
                                                    showDesktopNotification({
                                                        title: 'Mew Notification',
                                                        body: 'This is how your notifications will look.',
                                                        tag: 'mew:test',
                                                        data: { channelId: null },
                                                    });
                                                }}
                                                className={clsx(
                                                    "flex items-center gap-2 px-4 h-[34px] rounded-[3px] text-sm font-medium transition-all duration-200",
                                                    notif.desktopEnabled && typeof Notification !== 'undefined' && Notification.permission === 'granted'
                                                        ? "bg-[#4E5058] text-white hover:bg-[#6D6F78] active:bg-[#80848E]"
                                                        : "bg-[#4E5058]/50 text-[#949BA4] cursor-not-allowed opacity-60"
                                                )}
                                            >
                                                <Icon icon="mdi:bell-outline" width="16" />
                                                Send Test Notification
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
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

const SidebarItem: React.FC<{ label: string; isActive?: boolean; onClick?: () => void }> = ({ label, isActive, onClick }) => {
    return (
        <div
            onClick={onClick}
            className={clsx(
                "px-2.5 py-1.5 rounded-[4px] cursor-pointer mb-0.5 font-medium text-sm transition-colors",
                isActive
                    ? "bg-[#404249] text-gray-100"
                    : "text-mew-textMuted hover:bg-[#35373C] hover:text-gray-200"
            )}
        >
            {label}
        </div>
    )
}

export default UserSettings;
