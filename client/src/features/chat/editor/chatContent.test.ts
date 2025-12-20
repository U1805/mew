import { describe, it, expect } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import {
  serializeTiptapDocToContentString,
  extractMentionIdsFromDoc,
  parseContentStringToTiptapDoc,
  extractMentionIdsFromContentString,
} from './chatContent';

describe('chatContent', () => {
  it('serializeTiptapDocToContentString returns empty string for nullish doc', () => {
    expect(serializeTiptapDocToContentString(null)).toBe('');
    expect(serializeTiptapDocToContentString(undefined)).toBe('');
  });

  it('serializes text, mentions, and hardBreaks', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Hello ' },
            { type: 'mention', attrs: { id: 'u1' } },
            { type: 'text', text: '!' },
            { type: 'hardBreak' },
            { type: 'mention', attrs: { id: 'everyone', label: 'everyone' } },
            { type: 'text', text: ' ' },
            { type: 'mention', attrs: { id: 'here', label: 'here' } },
          ],
        },
      ],
    };

    expect(serializeTiptapDocToContentString(doc)).toBe('Hello <@u1>!\n@everyone @here');
  });

  it('joins multiple blocks with blank line', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    };
    expect(serializeTiptapDocToContentString(doc)).toBe('A\n\nB');
  });

  it('extractMentionIdsFromDoc ignores @everyone/@here and dedupes', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'mention', attrs: { id: 'u1' } },
            { type: 'mention', attrs: { id: 'u1' } },
            { type: 'mention', attrs: { id: 'everyone', label: 'everyone' } },
            { type: 'mention', attrs: { id: 'here', label: 'here' } },
            { type: 'mention', attrs: { label: 'no-id' } },
          ],
        },
      ],
    };
    expect(extractMentionIdsFromDoc(doc)).toEqual(['u1']);
  });

  it('parseContentStringToTiptapDoc parses user mentions, @everyone/@here and newlines', () => {
    const doc = parseContentStringToTiptapDoc('hi <@u1>\n@everyone @here');
    expect(doc.type).toBe('doc');
    const paragraph = doc.content?.[0] as JSONContent;
    const content = paragraph.content ?? [];

    expect(content).toEqual([
      { type: 'text', text: 'hi ' },
      { type: 'mention', attrs: { id: 'u1' } },
      { type: 'hardBreak' },
      { type: 'mention', attrs: { id: 'everyone', label: 'everyone' } },
      { type: 'text', text: ' ' },
      { type: 'mention', attrs: { id: 'here', label: 'here' } },
    ]);
  });

  it('extractMentionIdsFromContentString finds user mention ids and dedupes', () => {
    expect(extractMentionIdsFromContentString('x <@u1> y <@u2> <@u1>')).toEqual(['u1', 'u2']);
  });
});

