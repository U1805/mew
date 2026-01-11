import { Suspense, lazy, type ReactNode } from 'react';
import { ConfirmModal } from '../../shared/components/ConfirmModal';
import { useModalStore } from '../../shared/stores';
import type { ModalType } from '../../shared/stores/modalStore';

const modals = {
  createServer: lazy(() => import('../../features/server/modals/CreateServerModal').then(m => ({ default: m.CreateServerModal }))),
  createCategory: lazy(() => import('../../features/channel/modals/CreateCategoryModal').then(m => ({ default: m.CreateCategoryModal }))),
  createChannel: lazy(() => import('../../features/channel/modals/CreateChannelModal').then(m => ({ default: m.CreateChannelModal }))),
  deleteChannel: lazy(() => import('../../features/channel/modals/DeleteChannelModal').then(m => ({ default: m.DeleteChannelModal }))),
  deleteMessage: lazy(() => import('../../features/chat-messages/modals/DeleteMessageModal').then(m => ({ default: m.DeleteMessageModal }))),
  forwardMessage: lazy(() => import('../../features/chat-messages/modals/ForwardMessageModal').then(m => ({ default: m.ForwardMessageModal }))),
  deleteCategory: lazy(() => import('../../features/channel/modals/DeleteCategoryModal').then(m => ({ default: m.DeleteCategoryModal }))),
  deleteServer: lazy(() => import('../../features/server/modals/DeleteServerModal').then(m => ({ default: m.DeleteServerModal }))),
  leaveServer: lazy(() => import('../../features/server/modals/LeaveServerModal').then(m => ({ default: m.LeaveServerModal }))),
  createInvite: lazy(() => import('../../features/server/modals/CreateInviteModal').then(m => ({ default: m.CreateInviteModal }))),
  inviteBot: lazy(() => import('../../features/server/modals/InviteBotModal').then(m => ({ default: m.InviteBotModal }))),
  joinServer: lazy(() => import('../../features/server/modals/JoinServerModal').then(m => ({ default: m.JoinServerModal }))),
  serverSettings: lazy(() => import('../../features/server/modals/ServerSettingsModal').then(m => ({ default: m.ServerSettingsModal }))),
  serverNotifications: lazy(() => import('../../features/server/modals/ServerNotificationSettingsModal').then(m => ({ default: m.ServerNotificationSettingsModal }))),
  channelSettings: lazy(() => import('../../features/channel/modals/ChannelSettingsModal').then(m => ({ default: m.ChannelSettingsModal }))),
  channelNotifications: lazy(() => import('../../features/channel/modals/ChannelNotificationSettingsModal').then(m => ({ default: m.ChannelNotificationSettingsModal }))),
  editCategory: lazy(() => import('../../features/channel/modals/EditCategoryModal').then(m => ({ default: m.EditCategoryModal }))),
  findUser: lazy(() => import('../../features/users/modals/FindUserModal').then(m => ({ default: m.FindUserModal }))),
  userProfile: lazy(() => import('../../features/users/modals/UserProfileModal').then(m => ({ default: m.UserProfileModal }))),
  kickUser: lazy(() => import('../../features/server/modals/KickUserModal').then(m => ({ default: m.KickUserModal }))),
  addPermissionOverride: lazy(() => import('../../features/channel/modals/AddPermissionOverrideModal').then(m => ({ default: m.AddPermissionOverrideModal }))),
  manageBot: lazy(() => import('../../features/users/modals/BotEditorModal').then(m => ({ default: m.BotEditorModal }))),
} satisfies Record<Exclude<ModalType, 'confirm'>, ReturnType<typeof lazy>>;

const ModalManager = () => {
  const { activeModal, modalData, closeModal } = useModalStore();

  if (!activeModal) return null;

  if (activeModal === 'confirm') {
    const data = (modalData ?? {}) as {
      title?: string;
      description?: string;
      confirmText?: string;
      cancelText?: string;
      onConfirm?: () => void;
      confirmDisabled?: boolean;
      isLoading?: boolean;
      isDestructive?: boolean;
      children?: ReactNode;
    };

    return (
      <ConfirmModal
        title={data.title ?? 'Confirm'}
        description={data.description ?? ''}
        confirmText={data.confirmText}
        cancelText={data.cancelText}
        confirmDisabled={data.confirmDisabled}
        isLoading={data.isLoading}
        isDestructive={data.isDestructive}
        onCancel={closeModal}
        onConfirm={() => {
          data.onConfirm?.();
          closeModal();
        }}
      >
        {data.children}
      </ConfirmModal>
    );
  }

  const ActiveModal = modals[activeModal];
  if (!ActiveModal) return null;

  return (
    <Suspense fallback={null}>
      <ActiveModal />
    </Suspense>
  );
};

export default ModalManager;
