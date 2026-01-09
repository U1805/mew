import { create } from 'zustand';

export type ModalType =
  | 'createServer'
  | 'createChannel'
  | 'createCategory'
  | 'editCategory'
  | 'deleteCategory'
  | 'serverSettings'
  | 'serverNotifications'
  | 'deleteServer'
  | 'leaveServer'
  | 'channelSettings'
  | 'channelNotifications'
  | 'deleteChannel'
  | 'deleteMessage'
  | 'forwardMessage'
  | 'findUser'
  | 'userProfile'
  | 'createInvite'
  | 'inviteBot'
  | 'joinServer'
  | 'kickUser'
  | 'addPermissionOverride'
  | 'confirm'
  | 'manageBot';

interface ModalState {
  activeModal: ModalType | null;
  modalData: any;
  openModal: (modal: ModalType, data?: any) => void;
  closeModal: () => void;
}

export const useModalStore = create<ModalState>((set) => ({
  activeModal: null,
  modalData: null,
  openModal: (modal, data = null) => set({ activeModal: modal, modalData: data }),
  closeModal: () => set({ activeModal: null, modalData: null }),
}));

