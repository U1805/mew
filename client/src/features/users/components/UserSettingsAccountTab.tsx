import React, { type RefObject } from 'react';
import { Icon } from '@iconify/react';
import clsx from 'clsx';
import type { User } from '../../../shared/types';

export const UserSettingsAccountTab: React.FC<{
  user: User | null;
  isUploading: boolean;
  fileInputRef: RefObject<HTMLInputElement>;
  onAvatarClick: () => void;
  onAvatarFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onEditDisplayName: () => void;
  onChangePassword: () => void;
}> = ({ user, isUploading, fileInputRef, onAvatarClick, onAvatarFileChange, onEditDisplayName, onChangePassword }) => {
  return (
    <>
      <h2 className="text-xl font-bold text-white mb-6 hidden md:block">My Account</h2>
      <div className="bg-[#1E1F22] rounded-lg mb-8 overflow-hidden shadow-sm">
        <div className="h-[100px] bg-mew-accent relative">
          <div className="absolute left-4 -bottom-[36px]">
            <div className="w-[80px] h-[80px] rounded-full p-[6px] bg-[#1E1F22] relative group cursor-pointer" onClick={onAvatarClick}>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/png, image/jpeg, image/gif"
                onChange={onAvatarFileChange}
              />
              <div className="w-full h-full rounded-full overflow-hidden relative bg-[#1E1F22]">
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-mew-accentHover flex items-center justify-center text-white text-2xl font-bold">
                    {user?.username?.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div
                  className={clsx(
                    'absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity',
                    isUploading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                  )}
                >
                  {isUploading ? (
                    <Icon icon="mdi:loading" className="text-white animate-spin" width="24" />
                  ) : (
                    <span className="text-white text-[10px] font-bold uppercase tracking-wide">Change</span>
                  )}
                </div>
              </div>
              <div className="absolute bottom-1 right-1 w-6 h-6 rounded-full bg-green-500 border-[4px] border-[#1E1F22]" />
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
              onClick={onAvatarClick}
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
              <button
                onClick={onEditDisplayName}
                className="bg-[#383A40] hover:bg-[#404249] text-white px-4 py-1.5 rounded-[3px] text-sm font-medium transition-colors shrink-0"
              >
                Edit
              </button>
            </div>
            <div className="flex justify-between items-center">
              <div className="min-w-0 pr-2">
                <div className="text-xs font-bold text-mew-textMuted uppercase mb-1">Email</div>
                <div className="text-white text-sm font-medium truncate">
                  {user?.email ? user.email.replace(/(.{2})(.*)(@.*)/, '$1*****$3') : 'No Email'}
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

      <div className="h-[1px] bg-mew-divider my-8" />

      <h3 className="text-lg font-bold text-white mb-4">Password and Authentication</h3>
      <button
        onClick={onChangePassword}
        className="bg-mew-accent hover:bg-mew-accentHover text-white px-4 py-2 rounded-[3px] text-sm font-medium transition-colors mb-2"
      >
        Change Password
      </button>
      <div className="text-xs text-mew-textMuted mt-4 mb-8">
        <h4 className="font-bold uppercase mb-2">Two-Factor Authentication</h4>
        <p className="mb-4 leading-5 text-[#B5BAC1]">
          Protect your account with an extra layer of security. Once configured, you&rsquo;ll be required to enter both your password and an
          authentication code from your mobile phone in order to sign in.
        </p>
        <button className="bg-[#383A40] hover:bg-[#404249] text-white px-4 py-2 rounded-[3px] text-sm font-medium transition-colors">
          Enable Two-Factor Auth
        </button>
      </div>
    </>
  );
};

