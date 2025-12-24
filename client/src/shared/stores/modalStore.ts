import { create } from 'zustand';

type ModalType =
  | 'createServer'
  | 'createChannel'
  | 'createCategory'
  | 'editCategory'
  | 'deleteCategory'
  | 'serverSettings'
  | 'deleteServer'
  | 'leaveServer'
  | 'channelSettings'
  | 'deleteChannel'
  | 'deleteMessage'
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

