import React from 'react';
import { useModalStore } from '../../shared/stores/store';

import { CreateInviteModal } from '../../features/servers/modals/CreateInviteModal';
import { JoinServerModal } from '../../features/servers/modals/JoinServerModal';
import { ServerSettingsModal } from '../../features/servers/modals/ServerSettingsModal';
import { ChannelSettingsModal } from './ChannelSettingsModal';
import { EditCategoryModal } from './EditCategoryModal';
import { FindUserModal } from '../../features/users/modals/FindUserModal';
import { UserProfileModal } from '../../features/users/modals/UserProfileModal';
import { KickUserModal } from '../../features/servers/modals/KickUserModal';
import { GenericModal } from './GenericModal';

const ModalManager: React.FC = () => {
  const { activeModal } = useModalStore();

  if (!activeModal) return null;

  const genericModals = [
      'createServer', 'createCategory', 'createChannel',
      'deleteChannel', 'deleteMessage', 'deleteCategory', 'deleteServer', 'leaveServer'
  ];

  if (genericModals.includes(activeModal)) {
      return <GenericModal />;
  }

  switch (activeModal) {
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
    default:
      return null;
  }
};

export default ModalManager;