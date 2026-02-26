import React, { useState, useEffect } from 'react';
import { useI18n } from '../../../shared/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newUsername: string) => Promise<void>;
  currentUsername: string;
  isLoading: boolean;
}

export const EditDisplayNameModal: React.FC<Props> = ({ isOpen, onClose, onSave, currentUsername, isLoading }) => {
  const { t } = useI18n();
  const [username, setUsername] = useState(currentUsername);

  useEffect(() => {
    if (isOpen) {
      setUsername(currentUsername);
    }
  }, [isOpen, currentUsername]);

  if (!isOpen) return null;

  const handleSave = () => {
    if (username.trim() && username.trim() !== currentUsername) {
      onSave(username.trim());
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center animate-fade-in-fast"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#313338] rounded-md shadow-lg w-full max-w-md p-6 m-4">
        <h2 className="text-xl font-bold text-white mb-2">{t('modal.changeUsernameTitle')}</h2>
        <p className="text-sm text-mew-textMuted mb-4">{t('modal.changeUsernameDesc')}</p>

        <div className="mb-4">
            <label className="text-xs font-bold text-mew-textMuted uppercase mb-2 block">{t('auth.username')}</label>
            <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full bg-[#1E1F22] text-white p-2 rounded border border-[#1E1F22] focus:border-mew-accent focus:ring-0 outline-none transition-colors"
            />
        </div>

        <div className="flex justify-end gap-2 bg-[#2B2D31] p-4 -m-6 mt-6 rounded-b-md">
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-white px-4 py-2 rounded text-sm font-medium transition-colors hover:bg-transparent bg-transparent hover:underline"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={isLoading || !username.trim() || username.trim() === currentUsername}
            className="bg-mew-accent hover:bg-mew-accentHover text-white px-4 py-2 rounded text-sm font-medium transition-colors disabled:bg-mew-accent/50 disabled:cursor-not-allowed"
          >
            {isLoading ? t('common.saving') : t('common.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  );
};
