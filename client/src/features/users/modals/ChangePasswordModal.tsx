import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (passwords: { oldPassword, newPassword }) => Promise<void>;
  isLoading: boolean;
}

export const ChangePasswordModal: React.FC<Props> = ({ isOpen, onClose, onSave, isLoading }) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const validate = () => {
    if (newPassword && newPassword.length < 8) {
      setError('New password must be at least 8 characters long');
      return false;
    }
    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      setError('New passwords do not match.');
      return false;
    }
    setError('');
    return true;
  };

  useEffect(() => {
    if(isOpen) {
        validate();
    }
  }, [newPassword, confirmPassword, isOpen]);

  const clearForm = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
  }

  if (!isOpen) return null;

  const handleSave = () => {
    if (validate()) {
      onSave({ oldPassword, newPassword });
    }
  };

  const handleClose = () => {
    clearForm();
    onClose();
  }

  const canSave = oldPassword && newPassword && !error && !isLoading;

  return (
    <div className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center animate-fade-in-fast">
      <div className="bg-[#313338] rounded-md shadow-lg w-full max-w-md p-6 m-4">
        <h2 className="text-xl font-bold text-white mb-2">Change Your Password</h2>

        <div className="space-y-4 mb-4">
            <div>
                <label className="text-xs font-bold text-mew-textMuted uppercase mb-2 block">Current Password</label>
                <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="w-full bg-[#1E1F22] text-white p-2 rounded border border-[#1E1F22] focus:border-mew-accent focus:ring-0 outline-none transition-colors"
                />
            </div>
            <div>
                <label className="text-xs font-bold text-mew-textMuted uppercase mb-2 block">New Password</label>
                <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-[#1E1F22] text-white p-2 rounded border border-[#1E1F22] focus:border-mew-accent focus:ring-0 outline-none transition-colors"
                />
            </div>
            <div>
                <label className="text-xs font-bold text-mew-textMuted uppercase mb-2 block">Confirm New Password</label>
                <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-[#1E1F22] text-white p-2 rounded border border-[#1E1F22] focus:border-mew-accent focus:ring-0 outline-none transition-colors"
                />
            </div>
        </div>

        {error && <div className="text-red-400 text-sm mb-4">{error}</div>}

        <div className="flex justify-end gap-2 bg-[#2B2D31] p-4 -m-6 mt-6 rounded-b-md">
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-white px-4 py-2 rounded text-sm font-medium transition-colors hover:bg-transparent bg-transparent hover:underline"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="bg-mew-accent hover:bg-mew-accentHover text-white px-4 py-2 rounded text-sm font-medium transition-colors disabled:bg-mew-accent/50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};
