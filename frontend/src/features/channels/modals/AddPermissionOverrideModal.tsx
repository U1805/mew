import React from 'react';
import { useModalStore } from '../../../shared/stores';
import { PermissionTargetSelector } from './PermissionTargetSelector';

export const AddPermissionOverrideModal: React.FC = () => {
  const { closeModal, modalData } = useModalStore();

  if (!modalData || !modalData.roles || !modalData.members || !modalData.existingTargetIds || !modalData.onSelect) {
      // This case should ideally not happen if openModal is called correctly
      return <div className="text-red-500">Required modal data is missing.</div>;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 animate-fade-in" onClick={closeModal}>
      <div onClick={(e) => e.stopPropagation()}>
        <PermissionTargetSelector
          roles={modalData.roles}
          members={modalData.members}
          existingTargetIds={modalData.existingTargetIds}
          onSelect={modalData.onSelect}
          onClose={closeModal}
        />
      </div>
    </div>
  );
};
