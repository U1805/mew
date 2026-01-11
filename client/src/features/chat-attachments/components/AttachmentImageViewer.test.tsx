import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AttachmentImageViewer } from './AttachmentImageViewer';

describe('AttachmentImageViewer', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      disconnect() {}
      unobserve() {}
    });
  });

  it('zooms out on Alt+MouseDown (fallback when Alt+Click is swallowed)', () => {
    const onClose = vi.fn();
    const setRotation = vi.fn();

    render(
      <AttachmentImageViewer
        src="https://example.com/test.png"
        rotation={0}
        setRotation={setRotation}
        onEdit={vi.fn()}
        attachmentUrl="https://example.com/test.png"
        onClose={onClose}
      />,
    );

    const img = screen.getByAltText('Preview') as HTMLImageElement;
    expect(img.style.transform).toContain('scale(1)');

    fireEvent.click(img);
    expect(img.style.transform).toContain('scale(1.5)');

    fireEvent.mouseDown(img, { button: 0, altKey: true });
    expect(img.style.transform).toContain('scale(1)');

    // If the click event does fire, it should not double-apply the zoom-out.
    fireEvent.click(img, { altKey: true });
    expect(img.style.transform).toContain('scale(1)');
  });
});

