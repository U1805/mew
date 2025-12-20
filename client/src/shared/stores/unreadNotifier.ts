type NotifyServerStore = (channelId: string, action: 'add' | 'remove') => void;

let notifyServerStoreInternal: NotifyServerStore | undefined;

export const getNotifyServerStore = () => notifyServerStoreInternal;
export const setNotifyServerStore = (fn: NotifyServerStore | undefined) => {
  notifyServerStoreInternal = fn;
};

