import { describe, expect, it } from 'vitest';
import { createMessageSchema, getMessagesSchema, updateMessageSchema } from './message.validation';

describe('message.validation', () => {
  it('getMessagesSchema defaults limit to 50', () => {
    const parsed = getMessagesSchema.parse({ query: {} });
    expect(parsed.query.limit).toBe(50);
  });

  it('getMessagesSchema parses custom limit and before', () => {
    const parsed = getMessagesSchema.parse({ query: { limit: '20', before: 'm1' } });
    expect(parsed.query.limit).toBe(20);
    expect(parsed.query.before).toBe('m1');
  });

  it('getMessagesSchema rejects out-of-range limit', () => {
    expect(() => getMessagesSchema.parse({ query: { limit: '101' } })).toThrow();
  });

  it('createMessageSchema accepts default message with content', () => {
    const parsed = createMessageSchema.parse({ body: { content: 'hello' } });
    expect(parsed.body.content).toBe('hello');
  });

  it('createMessageSchema accepts default message with attachments only', () => {
    const parsed = createMessageSchema.parse({
      body: { attachments: [{ filename: 'a', contentType: 'image/png', key: 'k', size: 1 }] },
    });
    expect(parsed.body.attachments).toHaveLength(1);
  });

  it('createMessageSchema rejects default message without content or attachments', () => {
    expect(() => createMessageSchema.parse({ body: {} })).toThrow();
  });

  it('createMessageSchema rejects empty attachment key', () => {
    expect(() =>
      createMessageSchema.parse({
        body: { attachments: [{ filename: 'a', contentType: 'image/png', key: '', size: 1 }] },
      })
    ).toThrow();
  });

  it('createMessageSchema validates forward-card payload presence', () => {
    expect(() => createMessageSchema.parse({ body: { type: 'app/x-forward-card', payload: {} } })).toThrow();
    expect(
      createMessageSchema.parse({
        body: { type: 'app/x-forward-card', payload: { forwardedMessage: { content: 'x' } } },
      })
    ).toBeTruthy();
  });

  it('createMessageSchema validates voice payload structure', () => {
    expect(() =>
      createMessageSchema.parse({
        body: {
          type: 'message/voice',
          payload: { voice: { key: 'v.webm', contentType: 'audio/webm', size: 0 } },
        },
      })
    ).toThrow();

    const parsed = createMessageSchema.parse({
      body: {
        type: 'message/voice',
        payload: { voice: { key: 'v.webm', contentType: 'audio/webm', size: 10, durationMs: 1200 } },
      },
    });
    expect(parsed.body.type).toBe('message/voice');
  });

  it('createMessageSchema rejects invalid voice durationMs', () => {
    expect(() =>
      createMessageSchema.parse({
        body: {
          type: 'message/voice',
          payload: { voice: { key: 'v.webm', contentType: 'audio/webm', size: 10, durationMs: 0 } },
        },
      })
    ).toThrow();
  });

  it('createMessageSchema accepts non-default typed message with payload and no content', () => {
    const parsed = createMessageSchema.parse({
      body: {
        type: 'app/x-rss-card',
        payload: { title: 'x' },
      },
    });
    expect(parsed.body.type).toBe('app/x-rss-card');
  });

  it('createMessageSchema rejects non-default typed message without payload', () => {
    expect(() => createMessageSchema.parse({ body: { type: 'app/x-rss-card' } })).toThrow();
  });

  it('createMessageSchema accepts both plainText and plain-text fields', () => {
    const parsed = createMessageSchema.parse({ body: { content: 'x', plainText: 'a', 'plain-text': 'b' } });
    expect(parsed.body.plainText).toBe('a');
    expect((parsed.body as any)['plain-text']).toBe('b');
  });

  it('updateMessageSchema requires non-empty content', () => {
    expect(() => updateMessageSchema.parse({ body: { content: '' } })).toThrow();
    const parsed = updateMessageSchema.parse({ body: { content: 'ok' } });
    expect(parsed.body.content).toBe('ok');
  });
});
