import React from 'react';
import { render, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import useTabNotifier from './useTabNotifier';
import { useUnreadStore } from '../stores/unreadStore';

const generateFavicon = vi.fn(async (count: number) => `data:${count}`);
const updateFavicon = vi.fn();

vi.mock('../utils/favicon', () => ({
  generateFavicon: (count: number) => generateFavicon(count),
  updateFavicon: (dataUrl: string) => updateFavicon(dataUrl),
}));

const setDocumentHidden = (value: boolean) => {
  Object.defineProperty(document, 'hidden', { value, configurable: true });
};

const TestComponent = () => {
  useTabNotifier();
  return null;
};

describe('useTabNotifier', () => {
  beforeEach(() => {
    useUnreadStore.setState({ unreadChannelIds: new Set(), unreadMentionMessageIds: new Set() });
    generateFavicon.mockClear();
    updateFavicon.mockClear();
    document.title = 'Mew';
  });

  it('updates title/favicon when tab is hidden and unread changes', async () => {
    setDocumentHidden(true);
    render(<TestComponent />);

    act(() => {
      useUnreadStore.getState().addUnreadChannel('c1');
    });

    await waitFor(() => {
      expect(document.title).toBe('(1) Mew');
      expect(generateFavicon).toHaveBeenCalledWith(1);
      expect(updateFavicon).toHaveBeenCalledWith('data:1');
    });
  });

  it('resets title/favicon when tab becomes visible', async () => {
    setDocumentHidden(true);
    render(<TestComponent />);
    act(() => {
      useUnreadStore.getState().addUnreadChannel('c1');
    });

    await waitFor(() => expect(document.title).toBe('(1) Mew'));

    setDocumentHidden(false);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    await waitFor(() => {
      expect(document.title).toBe('Mew');
      expect(generateFavicon).toHaveBeenCalledWith(0);
      expect(updateFavicon).toHaveBeenCalledWith('data:0');
    });
  });

  it('does nothing when tab is visible', async () => {
    setDocumentHidden(false);
    render(<TestComponent />);

    act(() => {
      useUnreadStore.getState().addUnreadChannel('c1');
    });

    await new Promise((r) => setTimeout(r, 10));
    expect(generateFavicon).not.toHaveBeenCalled();
    expect(updateFavicon).not.toHaveBeenCalled();
    expect(document.title).toBe('Mew');
  });
});
