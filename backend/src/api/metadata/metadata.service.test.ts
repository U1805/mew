import { describe, it, expect, vi, afterEach } from 'vitest';
import { getLinkPreviewWithSafety } from './metadata.service';
import * as linkPreviewJs from 'link-preview-js';

// Mock the 'link-preview-js' module
vi.mock('link-preview-js', () => ({
  getLinkPreview: vi.fn(),
}));

describe('Metadata Service - getLinkPreviewWithSafety', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should return null if no URL is found in the text', async () => {
    const text = 'This is a string without any URLs.';
    const result = await getLinkPreviewWithSafety(text);
    expect(result).toBeNull();
    expect(linkPreviewJs.getLinkPreview).not.toHaveBeenCalled();
  });

  it('should return null if the text is empty or null', async () => {
    expect(await getLinkPreviewWithSafety('')).toBeNull();
    // @ts-ignore
    expect(await getLinkPreviewWithSafety(null)).toBeNull();
  });


  it('should call getLinkPreview with the correct options for a valid URL', async () => {
    const text = 'Check out this site: https://example.com';
    const mockPreviewData = { url: 'https://example.com', title: 'Example' };
    vi.mocked(linkPreviewJs.getLinkPreview).mockResolvedValue(mockPreviewData as any);

    const result = await getLinkPreviewWithSafety(text);

    expect(linkPreviewJs.getLinkPreview).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({
        timeout: 3000,
        followRedirects: 'manual',
        headers: expect.any(Object),
        resolveDNSHost: expect.any(Function),
        handleRedirects: expect.any(Function),
      })
    );
    expect(result).toEqual(mockPreviewData);
  });

  it('should extract the first URL if multiple are present', async () => {
    const text = 'First: http://first.com, second: https://second.com';
    vi.mocked(linkPreviewJs.getLinkPreview).mockResolvedValue({} as any);

    await getLinkPreviewWithSafety(text);

    expect(linkPreviewJs.getLinkPreview).toHaveBeenCalledWith(
      'http://first.com',
      expect.any(Object)
    );
  });

  it('should return null and log an error if getLinkPreview throws', async () => {
    const text = 'Link that will fail: https://fail.com';
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const error = new Error('Preview failed');
    vi.mocked(linkPreviewJs.getLinkPreview).mockRejectedValue(error);

    const result = await getLinkPreviewWithSafety(text);

    expect(result).toBeNull();
    expect(console.error).toHaveBeenCalledWith(
      '[MetadataService] Failed to fetch link preview for https://fail.com:',
      error
    );
    consoleErrorSpy.mockRestore();
  });
});
