import { describe, it, expect } from 'vitest';
import { getMessageBestEffortText } from './messageText';
import type { Message } from '../types';

function baseMessage(overrides: Partial<Message>): Message {
  const now = new Date('2026-01-21T00:00:00.000Z').toISOString();
  return {
    _id: 'm1',
    channelId: 'c1',
    authorId: 'u1',
    type: 'message/text',
    content: '',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('getMessageBestEffortText', () => {
  it('prefers message.content when present', () => {
    const message = baseMessage({ content: 'Hello world', payload: { title: 'Ignored' } });
    expect(getMessageBestEffortText(message)).toContain('Hello world');
  });

  it('extracts RSS card title/summary/url', () => {
    const message = baseMessage({
      type: 'app/x-rss-card',
      content: '',
      payload: {
        title: 'Example title',
        summary: 'Example summary',
        url: 'https://example.com/post',
        feed_title: 'Example Feed',
      },
    });

    const text = getMessageBestEffortText(message);
    expect(text).toContain('Example Feed');
    expect(text).toContain('Example title');
    expect(text).toContain('Example summary');
    expect(text).toContain('https://example.com/post');
  });

  it('extracts Twitter card text and quoted tweet text', () => {
    const message = baseMessage({
      type: 'app/x-twitter-card',
      content: '',
      payload: {
        url: 'https://x.com/example/status/1',
        text: 'Hello twitter',
        author_name: 'Example',
        author_handle: 'example',
        quoted_tweet: {
          url: 'https://x.com/other/status/2',
          text: 'Original tweet',
          author_name: 'Other',
          author_handle: 'other',
        },
      },
    });

    const text = getMessageBestEffortText(message);
    expect(text).toContain('Hello twitter');
    expect(text).toContain('Original tweet');
    expect(text).toContain('https://x.com/example/status/1');
    expect(text).toContain('https://x.com/other/status/2');
  });

  it('extracts Bilibili card fields and original_post text', () => {
    const message = baseMessage({
      type: 'app/x-bilibili-card',
      content: '',
      payload: {
        title: 'Example Title',
        description: 'Example desc',
        dynamic_url: 'https://t.bilibili.com/123',
        author_name: 'UP 主',
        original_post: {
          text: 'Nested text',
        },
      },
    });

    const text = getMessageBestEffortText(message);
    expect(text).toContain('UP 主');
    expect(text).toContain('Example Title');
    expect(text).toContain('Example desc');
    expect(text).toContain('Nested text');
    expect(text).toContain('https://t.bilibili.com/123');
  });

  it('uses voice transcript when content is empty', () => {
    const message = baseMessage({
      type: 'message/voice',
      content: '',
      plainText: 'Hello from transcript',
      payload: { voice: { key: 'k', url: 'https://cdn.local/v.webm', contentType: 'audio/webm', size: 1 } },
    });
    expect(getMessageBestEffortText(message)).toContain('Hello from transcript');
  });
});

