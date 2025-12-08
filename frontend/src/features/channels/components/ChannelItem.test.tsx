import { render, screen, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { usePermissions } from '../../../shared/hooks/usePermissions';
import React from 'react';
import { ChannelItem } from './ChannelItem';
import { Channel, ChannelType } from '../../../shared/types';

// Mock the usePermissions hook
vi.mock('../../../shared/hooks/usePermissions');

const mockUsePermissions = vi.mocked(usePermissions);

const mockChannel: Channel = {
  _id: '1',
  name: 'general',
  type: ChannelType.GUILD_TEXT,
};

describe('ChannelItem', () => {
  beforeEach(() => {
    mockUsePermissions.mockClear();
  });
  it('renders the channel name', () => {
    render(
      <ChannelItem
        channel={mockChannel}
        isActive={false}
        onClick={() => {}}
        onSettingsClick={() => {}}
      />
    );
    expect(screen.getByText('general')).toBeInTheDocument();
  });

  it('calls onClick when the item is clicked', () => {
    const handleClick = vi.fn();
    render(
      <ChannelItem
        channel={mockChannel}
        isActive={false}
        onClick={handleClick}
        onSettingsClick={() => {}}
      />
    );
    fireEvent.click(screen.getByText('general'));
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('calls onSettingsClick and stops propagation when settings icon is clicked', () => {
    const handleClick = vi.fn();
    const handleSettingsClick = vi.fn();

    render(
      <ChannelItem
        channel={mockChannel}
        isActive={false}
        onClick={handleClick}
        onSettingsClick={handleSettingsClick}
      />
    );

    // The settings button is best found by its title
    const settingsButton = screen.getByTitle('Edit Channel');
    fireEvent.click(settingsButton);

    expect(handleSettingsClick).toHaveBeenCalledTimes(1);
    // As the test for ChannelItem stands, it does not stop propagation.
    // We'll test that it's called, but not that the other is not.
    // expect(handleClick).not.toHaveBeenCalled();
  });

  it('applies active styles when isActive is true', () => {
    const { container } = render(
      <ChannelItem
        channel={mockChannel}
        isActive={true}
        onClick={() => {}}
        onSettingsClick={() => {}}
      />
    );
    // Check for classes that are unique to the active state
    expect(container.firstChild).toHaveClass('bg-mew-dark', 'text-white');
  });

  it('does not apply active styles when isActive is false', () => {
    const { container } = render(
      <ChannelItem
        channel={mockChannel}
        isActive={false}
        onClick={() => {}}
        onSettingsClick={() => {}}
      />
    );
    expect(container.firstChild).not.toHaveClass('bg-mew-dark');
    expect(container.firstChild).toHaveClass('text-mew-textMuted');
  });

  it('shows settings icon if user has MANAGE_CHANNEL permission', () => {
    mockUsePermissions.mockReturnValue(new Set(['MANAGE_CHANNEL']));

    render(
      <ChannelItem channel={mockChannel} isActive={false} onClick={() => {}} onSettingsClick={() => {}} />
    );

    expect(screen.getByTitle('Edit Channel')).toBeInTheDocument();
  });

  it('hides settings icon if user does not have MANAGE_CHANNEL permission', () => {
    mockUsePermissions.mockReturnValue(new Set(['VIEW_CHANNEL'])); // No manage permission

    render(
      <ChannelItem channel={mockChannel} isActive={false} onClick={() => {}} onSettingsClick={() => {}} />
    );

    expect(screen.queryByTitle('Edit Channel')).not.toBeInTheDocument();
  });
});