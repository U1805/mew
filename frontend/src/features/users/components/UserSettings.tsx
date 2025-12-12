import React, { useRef, useState } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { useUIStore, useAuthStore } from '../../../shared/stores';
import { userApi } from '../../../shared/services/api';
import { ConfirmModal } from '../../../shared/components/ConfirmModal';

const UserSettings: React.FC = () => {
  const { isSettingsOpen, closeSettings } = useUIStore();
  const { user, logout, setAuth, token } = useAuthStore();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

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

      if (file.size > 2 * 1024 * 1024) {
          toast.error("Image size must be less than 2MB");
          return;
      }

      setPendingFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      e.target.value = ''; // Reset input to allow re-selecting the same file if cancelled
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
          toast.error("Failed to update avatar");
      } finally {
          setIsUploading(false);
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-[#313338] animate-fade-in text-mew-text font-sans">
      {/* Sidebar (Left) */}
      <div className="w-full max-w-[35%] min-w-[218px] bg-[#2B2D31] flex flex-col items-end pt-[60px] pb-4 px-2 overflow-y-auto">
         <div className="w-[192px] px-1.5">
            <div className="text-xs font-bold text-mew-textMuted uppercase px-2.5 mb-1.5 mt-2">User Settings</div>
            
            <SidebarItem label="My Account" isActive />
            <SidebarItem label="Profiles" />
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
            <SidebarItem label="Notifications" />

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
      <div className="flex-1 bg-[#313338] pt-[60px] px-10 max-w-[740px] overflow-y-auto custom-scrollbar">
        <h2 className="text-xl font-bold text-white mb-6">My Account</h2>

        {/* Profile Card */}
        <div className="bg-[#1E1F22] rounded-lg mb-8 overflow-hidden">
            {/* Banner Area */}
            <div className="h-[100px] bg-mew-accent relative">
                {/* Avatar */}
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
                        
                        <div className="w-full h-full rounded-full overflow-hidden relative">
                            {user?.avatarUrl ? (
                                <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                                <div className="w-full h-full bg-mew-accentHover flex items-center justify-center text-white text-2xl font-bold">
                                    {user?.username?.slice(0, 2).toUpperCase()}
                                </div>
                            )}
                            
                            {/* Hover Overlay */}
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

            {/* Info Area */}
            <div className="pt-12 pb-4 px-4">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-xl font-bold text-white">{user?.username}</h3>
                        <p className="text-sm text-mew-textMuted">#{user?._id?.slice(0, 4) || '0000'}</p>
                    </div>
                    <button 
                        onClick={handleAvatarClick}
                        disabled={isUploading}
                        className="bg-mew-accent hover:bg-mew-accentHover text-white px-4 py-1.5 rounded text-sm font-medium transition-colors"
                    >
                        Edit User Profile
                    </button>
                </div>

                {/* Account Details Block */}
                <div className="bg-[#2B2D31] rounded-lg p-4 space-y-5">
                    
                    {/* Display Name */}
                    <div className="flex justify-between items-center">
                        <div>
                            <div className="text-xs font-bold text-mew-textMuted uppercase mb-1">Display Name</div>
                            <div className="text-white text-sm font-medium">{user?.username}</div>
                        </div>
                        <button className="bg-[#383A40] hover:bg-[#404249] text-white px-4 py-1.5 rounded text-sm font-medium transition-colors">
                            Edit
                        </button>
                    </div>

                    {/* Email */}
                    <div className="flex justify-between items-center">
                        <div>
                            <div className="text-xs font-bold text-mew-textMuted uppercase mb-1">Email</div>
                            <div className="text-white text-sm font-medium">
                                {user?.email ? user.email.replace(/(.{2})(.*)(@.*)/, "$1*****$3") : 'No Email'}
                            </div>
                        </div>
                        <button className="bg-[#383A40] hover:bg-[#404249] text-white px-4 py-1.5 rounded text-sm font-medium transition-colors">
                            Edit
                        </button>
                    </div>

                    {/* Phone Number */}
                    <div className="flex justify-between items-center">
                        <div>
                            <div className="text-xs font-bold text-mew-textMuted uppercase mb-1">Phone Number</div>
                            <div className="text-mew-textMuted text-sm">You haven&rsquo;t added a phone number yet.</div>
                        </div>
                        <button className="bg-[#383A40] hover:bg-[#404249] text-white px-4 py-1.5 rounded text-sm font-medium transition-colors">
                            Add
                        </button>
                    </div>

                </div>
            </div>
        </div>

        <div className="h-[1px] bg-mew-divider my-8"></div>

        {/* Password & Auth */}
        <h3 className="text-lg font-bold text-white mb-4">Password and Authentication</h3>
        <button className="bg-mew-accent hover:bg-mew-accentHover text-white px-4 py-2 rounded text-sm font-medium transition-colors mb-2">
            Change Password
        </button>
        <div className="text-xs text-mew-textMuted mt-4 mb-8">
            <h4 className="font-bold uppercase mb-2">Two-Factor Authentication</h4>
            <p className="mb-4">Protect your account with an extra layer of security. Once configured, you&rsquo;ll be required to enter both your password and an authentication code from your mobile phone in order to sign in.</p>
            <button className="bg-[#383A40] hover:bg-[#404249] text-white px-4 py-2 rounded text-sm font-medium transition-colors">
                Enable Two-Factor Auth
            </button>
        </div>

      </div>

      {/* Close Button Column (Right) */}
      <div className="w-[18%] min-w-[60px] pt-[60px] pl-5">
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
    </div>
  );
};

const SidebarItem: React.FC<{ label: string; isActive?: boolean }> = ({ label, isActive }) => {
    return (
        <div className={clsx(
            "px-2.5 py-1.5 rounded-[4px] cursor-pointer mb-0.5 font-medium text-sm transition-colors",
            isActive 
                ? "bg-[#404249] text-white" 
                : "text-mew-textMuted hover:bg-[#35373C] hover:text-mew-text"
        )}>
            {label}
        </div>
    )
}

export default UserSettings;