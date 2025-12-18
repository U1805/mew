import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateFavicon, updateFavicon } from './favicon';

class MockImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = '';
  set src(value: string) {
    this._src = value;
    queueMicrotask(() => this.onload?.());
  }
  get src() {
    return this._src;
  }
}

describe('favicon utils', () => {
  const originalImage = globalThis.Image;
  const originalTitle = document.title;

  beforeEach(() => {
    document.title = originalTitle;
    (globalThis as any).Image = MockImage;
    document.head.innerHTML = '';
  });

  afterEach(() => {
    (globalThis as any).Image = originalImage;
    vi.restoreAllMocks();
  });

  it('generateFavicon returns original favicon for count=0', async () => {
    await expect(generateFavicon(0)).resolves.toBe('/favicon.svg');
  });

  it('generateFavicon draws badge and returns data URL for count>0', async () => {
    const mockContext = {
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
    };

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = originalCreateElement(tag as any) as any;
      if (tag === 'canvas') {
        el.getContext = () => mockContext;
        el.toDataURL = () => 'data:image/png;base64,abc';
      }
      return el;
    }) as any);

    const url = await generateFavicon(5);
    expect(url).toBe('data:image/png;base64,abc');
    expect(mockContext.fillText).toHaveBeenCalledWith('5', expect.any(Number), expect.any(Number));
  });

  it('generateFavicon caps badge text at 99+', async () => {
    const mockContext = {
      drawImage: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      fillStyle: '',
      font: '',
      textAlign: '',
      textBaseline: '',
    };

    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
      const el = originalCreateElement(tag as any) as any;
      if (tag === 'canvas') {
        el.getContext = () => mockContext;
        el.toDataURL = () => 'data:image/png;base64,abc';
      }
      return el;
    }) as any);

    await generateFavicon(120);
    expect(mockContext.fillText).toHaveBeenCalledWith('99+', expect.any(Number), expect.any(Number));
  });

  it('updateFavicon updates existing icon link', () => {
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = '/favicon.svg';
    document.head.appendChild(link);

    updateFavicon('data:test');
    expect((document.querySelector("link[rel*='icon']") as HTMLLinkElement).href).toContain('data:test');
  });

  it('updateFavicon creates icon link when missing', () => {
    expect(document.querySelector("link[rel*='icon']")).toBeNull();
    updateFavicon('data:test');
    const link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null;
    expect(link).not.toBeNull();
    expect(link?.href).toContain('data:test');
  });
});

