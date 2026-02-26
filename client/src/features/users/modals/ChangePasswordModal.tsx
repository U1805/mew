import React, { useState, useEffect } from 'react';
import { getApiErrorMessage } from '../../../shared/utils/apiError';
import { useI18n } from '../../../shared/i18n';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onSave: (passwords: { oldPassword, newPassword }) => Promise<void>;
  isLoading: boolean;
}

export const ChangePasswordModal: React.FC<Props> = ({ isOpen, onClose, onSave, isLoading }) => {
  const { t } = useI18n();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');

  const validate = () => {
    if (newPassword && newPassword.length < 8) {
      setError(t('validation.passwordMinLength'));
      return false;
    }
    if (newPassword && confirmPassword && newPassword !== confirmPassword) {
      setError(t('validation.passwordMismatch'));
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

  useEffect(() => {
    if (isOpen) setSubmitError('');
  }, [isOpen]);

  const clearForm = () => {
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setSubmitError('');
  }

  if (!isOpen) return null;

  const handleSave = async () => {
    if (validate()) {
      setSubmitError('');
      try {
        await onSave({ oldPassword, newPassword });
      } catch (e) {
        setSubmitError(getApiErrorMessage(e, t('toast.updatePasswordFailed')));
      }
    }
  };

  const handleClose = () => {
    clearForm();
    onClose();
  }

  const canSave = oldPassword && newPassword && !error && !isLoading;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/70 flex items-center justify-center animate-fade-in-fast"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="bg-[#313338] rounded-md shadow-lg w-full max-w-md p-6 m-4">
        <h2 className="text-xl font-bold text-white mb-2">{t('modal.changePasswordTitle')}</h2>

        <div className="space-y-4 mb-4">
            <div>
                <label className="text-xs font-bold text-mew-textMuted uppercase mb-2 block">{t('modal.currentPassword')}</label>
                <input
                    type="password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="w-full bg-[#1E1F22] text-white p-2 rounded border border-[#1E1F22] focus:border-mew-accent focus:ring-0 outline-none transition-colors"
                />
            </div>
            <div>
                <label className="text-xs font-bold text-mew-textMuted uppercase mb-2 block">{t('modal.newPassword')}</label>
                <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full bg-[#1E1F22] text-white p-2 rounded border border-[#1E1F22] focus:border-mew-accent focus:ring-0 outline-none transition-colors"
                />
            </div>
            <div>
                <label className="text-xs font-bold text-mew-textMuted uppercase mb-2 block">{t('modal.confirmNewPassword')}</label>
                <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full bg-[#1E1F22] text-white p-2 rounded border border-[#1E1F22] focus:border-mew-accent focus:ring-0 outline-none transition-colors"
                />
            </div>
        </div>

        {error && <div className="text-red-400 text-sm mb-4">{error}</div>}
        {submitError && <div className="text-red-400 text-sm mb-4">{submitError}</div>}

        <div className="flex justify-end gap-2 bg-[#2B2D31] p-4 -m-6 mt-6 rounded-b-md">
          <button
            onClick={handleClose}
            disabled={isLoading}
            className="text-white px-4 py-2 rounded text-sm font-medium transition-colors hover:bg-transparent bg-transparent hover:underline"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave}
            className="bg-mew-accent hover:bg-mew-accentHover text-white px-4 py-2 rounded text-sm font-medium transition-colors disabled:bg-mew-accent/50 disabled:cursor-not-allowed"
          >
            {isLoading ? t('common.saving') : t('common.saveChanges')}
          </button>
        </div>
      </div>
    </div>
  );
};
