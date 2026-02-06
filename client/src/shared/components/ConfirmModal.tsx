import React from 'react';
import clsx from 'clsx';
import { useI18n } from '../i18n';

interface ConfirmModalProps {
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  confirmDisabled?: boolean;
  isDestructive?: boolean;
  children?: React.ReactNode;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  title,
  description,
  confirmText,
  cancelText,
  onConfirm,
  onCancel,
  isLoading = false,
  confirmDisabled = false,
  isDestructive = true,
  children
}) => {
  const { t } = useI18n();

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in sm:p-0">
      <div className="bg-[#313338] w-full sm:w-full sm:max-w-md rounded-t-lg sm:rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in max-h-[85vh] sm:max-h-[80vh]">

        <div className="px-4 pt-5 pb-2 shrink-0">
          <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
          <p className="text-mew-textMuted text-sm leading-5 break-words">{description}</p>
        </div>

        <div className="px-4 pb-3 overflow-y-auto flex-1 min-h-0 custom-scrollbar">
          {children}
        </div>

        <div className="bg-[#2B2D31] p-4 flex justify-end items-center mt-auto space-x-3 shrink-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="text-white hover:underline text-sm font-medium px-4"
          >
            {cancelText || t('common.cancel')}
          </button>
          <button
            onClick={onConfirm}
            disabled={isLoading || confirmDisabled}
            className={clsx(
              "px-6 py-2 rounded-[3px] font-medium text-sm transition-colors text-white",
              isDestructive
                ? "bg-red-500 hover:bg-red-600"
                : "bg-mew-accent hover:bg-mew-accentHover",
              (isLoading || confirmDisabled) && "opacity-50 cursor-not-allowed"
            )}
          >
            {isLoading ? t('common.processing') : confirmText || t('common.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};
