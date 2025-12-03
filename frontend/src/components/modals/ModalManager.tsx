import React from 'react';
import { useModalStore } from '../../shared/stores/store';

import { CreateInviteModal } from './CreateInviteModal';
import { JoinServerModal } from './JoinServerModal';
import { ServerSettingsModal } from './ServerSettingsModal';
import { ChannelSettingsModal } from './ChannelSettingsModal';
import { EditCategoryModal } from './EditCategoryModal';
import { FindUserModal } from './FindUserModal';
import { UserProfileModal } from './UserProfileModal';
import { KickUserModal } from './KickUserModal';
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