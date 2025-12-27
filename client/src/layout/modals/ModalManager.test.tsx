import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import ModalManager from './ModalManager';
import { useModalStore } from '../../shared/stores';

vi.mock('../../features/servers/modals/CreateInviteModal', () => ({
  CreateInviteModal: () => <div data-testid="createInvite" />,
}));
vi.mock('../../features/servers/modals/JoinServerModal', () => ({
  JoinServerModal: () => <div data-testid="joinServer" />,
}));
vi.mock('../../features/servers/modals/ServerSettingsModal', () => ({
  ServerSettingsModal: () => <div data-testid="serverSettings" />,
}));
vi.mock('../../features/channels/modals/ChannelSettingsModal', () => ({
  ChannelSettingsModal: () => <div data-testid="channelSettings" />,
}));
vi.mock('../../features/channels/modals/EditCategoryModal', () => ({
  EditCategoryModal: () => <div data-testid="editCategory" />,
}));
vi.mock('../../features/users/modals/FindUserModal', () => ({
  FindUserModal: () => <div data-testid="findUser" />,
}));
vi.mock('../../features/users/modals/UserProfileModal', () => ({
  UserProfileModal: () => <div data-testid="userProfile" />,
}));
vi.mock('../../features/servers/modals/KickUserModal', () => ({
  KickUserModal: () => <div data-testid="kickUser" />,
}));
vi.mock('../../features/channels/modals/AddPermissionOverrideModal', () => ({
  AddPermissionOverrideModal: () => <div data-testid="addPermissionOverride" />,
}));
vi.mock('../../features/servers/modals/CreateServerModal', () => ({
  CreateServerModal: () => <div data-testid="createServer" />,
}));
vi.mock('../../features/channels/modals/CreateCategoryModal', () => ({
  CreateCategoryModal: () => <div data-testid="createCategory" />,
}));
vi.mock('../../features/channels/modals/CreateChannelModal', () => ({
  CreateChannelModal: () => <div data-testid="createChannel" />,
}));
vi.mock('../../features/channels/modals/DeleteChannelModal', () => ({
  DeleteChannelModal: () => <div data-testid="deleteChannel" />,
}));
vi.mock('../../features/chat-messages/modals/DeleteMessageModal', () => ({
  DeleteMessageModal: () => <div data-testid="deleteMessage" />,
}));
vi.mock('../../features/chat-messages/modals/ForwardMessageModal', () => ({
  ForwardMessageModal: () => <div data-testid="forwardMessage" />,
}));
vi.mock('../../features/channels/modals/DeleteCategoryModal', () => ({
  DeleteCategoryModal: () => <div data-testid="deleteCategory" />,
}));
vi.mock('../../features/servers/modals/DeleteServerModal', () => ({
  DeleteServerModal: () => <div data-testid="deleteServer" />,
}));
vi.mock('../../features/servers/modals/LeaveServerModal', () => ({
  LeaveServerModal: () => <div data-testid="leaveServer" />,
}));
vi.mock('../../features/users/modals/BotEditorModal', () => ({
  BotEditorModal: () => <div data-testid="manageBot" />,
}));
vi.mock('../../features/servers/modals/InviteBotModal', () => ({
  InviteBotModal: () => <div data-testid="inviteBot" />,
}));

describe('ModalManager', () => {
  beforeEach(() => {
    useModalStore.setState({ activeModal: null, modalData: null });
  });

  it('renders nothing when no active modal', () => {
    const { container } = render(<ModalManager />);
    expect(container.firstChild).toBeNull();
  });

  it('renders matching modal for activeModal', () => {
    useModalStore.setState({ activeModal: 'createInvite', modalData: null });
    render(<ModalManager />);
    expect(screen.getByTestId('createInvite')).toBeInTheDocument();
  });
});
