import { useModalStore } from '../../../shared/stores';
import { useI18n } from '../../../shared/i18n';
import { PermissionTargetSelector } from './PermissionTargetSelector';

export const AddPermissionOverrideModal = () => {
  const { closeModal, modalData } = useModalStore();
  const { t } = useI18n();

  if (!modalData || !modalData.roles || !modalData.members || !modalData.existingTargetIds || !modalData.onSelect) {
      return <div className="text-red-500">{t('channel.permissions.modalDataMissing')}</div>;
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
