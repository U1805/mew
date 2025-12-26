import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, fireEvent, screen } from '@testing-library/react';
import { parseMessageContent } from './messageParser';

vi.mock('../../features/chat-messages/components/Mention', () => ({
  Mention: ({ userId }: { userId: string }) => (
    <span data-testid="mention" data-userid={userId}>
      @{userId}
    </span>
  ),
}));

describe('parseMessageContent', () => {
  it('replaces <@id>, @everyone/@here, and URLs with elements', () => {
    render(
      <div>
        {parseMessageContent('hi <@u1> @everyone @here https://example.com')}
      </div>
    );

    expect(screen.getByTestId('mention')).toHaveAttribute('data-userid', 'u1');
    expect(screen.getByText('@everyone')).toBeInTheDocument();
    expect(screen.getByText('@here')).toBeInTheDocument();

    const link = screen.getByRole('link', { name: 'https://example.com' });
    expect(link).toHaveAttribute('href', 'https://example.com');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('stops propagation when clicking URL', () => {
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        {parseMessageContent('go https://example.com')}
      </div>
    );

    fireEvent.click(screen.getByRole('link', { name: 'https://example.com' }));
    expect(onParentClick).not.toHaveBeenCalled();
  });
});

