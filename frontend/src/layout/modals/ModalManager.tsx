import { useModalStore } from '../../shared/stores';
import { CreateInviteModal } from '../../features/servers/modals/CreateInviteModal';
import { JoinServerModal } from '../../features/servers/modals/JoinServerModal';
import { ServerSettingsModal } from '../../features/servers/modals/ServerSettingsModal';
import { ChannelSettingsModal } from '../../features/channels/modals/ChannelSettingsModal';
import { EditCategoryModal } from '../../features/channels/modals/EditCategoryModal';
import { FindUserModal } from '../../features/users/modals/FindUserModal';
import { UserProfileModal } from '../../features/users/modals/UserProfileModal';
import { KickUserModal } from '../../features/servers/modals/KickUserModal';
import { AddPermissionOverrideModal } from '../../features/channels/modals/AddPermissionOverrideModal';
import { CreateServerModal } from '../../features/servers/modals/CreateServerModal';
import { CreateCategoryModal } from '../../features/channels/modals/CreateCategoryModal';
import { CreateChannelModal } from '../../features/channels/modals/CreateChannelModal';
import { DeleteChannelModal } from '../../features/channels/modals/DeleteChannelModal';
import { DeleteMessageModal } from '../../features/messages/modals/DeleteMessageModal';
import { DeleteCategoryModal } from '../../features/channels/modals/DeleteCategoryModal';
import { DeleteServerModal } from '../../features/servers/modals/DeleteServerModal';
import { LeaveServerModal } from '../../features/servers/modals/LeaveServerModal';

const ModalManager = () => {
  const { activeModal } = useModalStore();

  if (!activeModal) return null;

  switch (activeModal) {
    case 'createServer':
      return <CreateServerModal />;
    case 'createCategory':
      return <CreateCategoryModal />;
    case 'createChannel':
      return <CreateChannelModal />;
    case 'deleteChannel':
      return <DeleteChannelModal />;
    case 'deleteMessage':
      return <DeleteMessageModal />;
    case 'deleteCategory':
      return <DeleteCategoryModal />;
    case 'deleteServer':
      return <DeleteServerModal />;
    case 'leaveServer':
      return <LeaveServerModal />;
    case 'createInvite':
      return <CreateInviteModal />;
    case 'joinServer':
      return <JoinServerModal />;
    case 'serverSettings':
      return <ServerSettingsModal />;
    case 'channelSettings':
      return <ChannelSettingsModal />;
    case 'editCategory':
      return <EditCategoryModal />;
    case 'findUser':
      return <FindUserModal />;
    case 'userProfile':
      return <UserProfileModal />;
    case 'kickUser':
      return <KickUserModal />;
    case 'addPermissionOverride':
      return <AddPermissionOverrideModal />;
    default:
      return null;
  }
};

export default ModalManager;
