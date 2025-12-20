import { describe, it, expect, beforeEach } from 'vitest';
import { useModalStore } from './modalStore';

describe('useModalStore', () => {
  beforeEach(() => {
    useModalStore.setState({ activeModal: null, modalData: null });
  });

  it('openModal sets activeModal and modalData', () => {
    useModalStore.getState().openModal('createServer', { foo: 'bar' });
    expect(useModalStore.getState().activeModal).toBe('createServer');
    expect(useModalStore.getState().modalData).toEqual({ foo: 'bar' });
  });

  it('closeModal resets activeModal and modalData', () => {
    useModalStore.getState().openModal('findUser', { q: 'x' });
    useModalStore.getState().closeModal();
    expect(useModalStore.getState().activeModal).toBeNull();
    expect(useModalStore.getState().modalData).toBeNull();
  });
});

