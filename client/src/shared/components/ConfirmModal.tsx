import React from 'react';
import clsx from 'clsx';

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
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  onConfirm,
  onCancel,
  isLoading = false,
  confirmDisabled = false,
  isDestructive = true,
  children
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-[#313338] w-full max-w-md rounded-[4px] shadow-lg flex flex-col overflow-hidden animate-scale-in">
        <div className="p-4 pt-5 pb-3">
          <h2 className="text-xl font-bold text-white mb-2">{title}</h2>
          <p className="text-mew-textMuted text-sm leading-5">{description}</p>
          {children}
        </div>

        <div className="bg-[#2B2D31] p-4 flex justify-end items-center mt-2 space-x-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="text-white hover:underline text-sm font-medium px-4"
          >
            {cancelText}
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
            {isLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};
