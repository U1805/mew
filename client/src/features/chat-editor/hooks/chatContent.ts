import type { JSONContent } from '@tiptap/core';

export type ChatMentionAttrs = {
  id?: string;
  label?: string;
};

const USER_MENTION_RE = /<@([a-zA-Z0-9_]+)>/g;
const TOKEN_RE = /(<@[a-zA-Z0-9_]+>|@everyone|@here|\n)/g;

function serializeMention(attrs: ChatMentionAttrs | undefined): string {
  const id = attrs?.id;
  const label = attrs?.label;

  if (!id) {
    return label ? `@${label}` : '';
  }

  if (id === 'everyone' || id === 'here') {
    return `@${id}`;
  }

  return `<@${id}>`;
}

function serializeNode(node: JSONContent | null | undefined): string {
  if (!node) return '';

  switch (node.type) {
    case 'text':
      return node.text ?? '';
    case 'mention':
      return serializeMention(node.attrs as ChatMentionAttrs | undefined);
    case 'hardBreak':
      return '\n';
    default: {
      const children = node.content ?? [];
      const inner = children.map(serializeNode).join('');
      if (node.type === 'paragraph') {
        return inner;
      }
      return inner;
    }
  }
}

export function serializeTiptapDocToContentString(doc: JSONContent | null | undefined): string {
  if (!doc) return '';
  const blocks = (doc.content ?? []).filter(Boolean);

  const serializedBlocks = blocks.map((block) => serializeNode(block));
  return serializedBlocks.join('\n\n');
}

export function extractMentionIdsFromDoc(doc: JSONContent | null | undefined): string[] {
  const ids = new Set<string>();

  function walk(node: JSONContent | null | undefined) {
    if (!node) return;
    if (node.type === 'mention') {
      const attrs = node.attrs as ChatMentionAttrs | undefined;
      const id = attrs?.id;
      if (id && id !== 'everyone' && id !== 'here') {
        ids.add(id);
      }
    }
    node.content?.forEach(walk);
  }

  walk(doc);
  return Array.from(ids);
}

export function parseContentStringToTiptapDoc(content: string): JSONContent {
  const tokens = content.split(TOKEN_RE).filter((t) => t !== '');

  const paragraphContent: JSONContent[] = [];

  for (const token of tokens) {
    if (token === '\n') {
      paragraphContent.push({ type: 'hardBreak' });
      continue;
    }

    if (token === '@everyone') {
      paragraphContent.push({
        type: 'mention',
        attrs: { id: 'everyone', label: 'everyone' },
      });
      continue;
    }

    if (token === '@here') {
      paragraphContent.push({
        type: 'mention',
        attrs: { id: 'here', label: 'here' },
      });
      continue;
    }

    const mentionMatch = token.match(/^<@([a-zA-Z0-9_]+)>$/);
    if (mentionMatch) {
      paragraphContent.push({
        type: 'mention',
        attrs: { id: mentionMatch[1] },
      });
      continue;
    }

    if (token.length) {
      paragraphContent.push({ type: 'text', text: token });
    }
  }

  return {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: paragraphContent,
      },
    ],
  };
}

export function extractMentionIdsFromContentString(content: string): string[] {
  const ids = new Set<string>();
  const matches = content.matchAll(USER_MENTION_RE);
  for (const match of matches) {
    ids.add(match[1]);
  }
  return Array.from(ids);
}
