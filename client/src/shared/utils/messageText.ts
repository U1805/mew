import type { Message } from '../types';

function safeTrim(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeRecord(value: unknown): Record<string, any> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, any>;
}

function pushUnique(lines: string[], value: string) {
  const text = value.trim();
  if (!text) return;
  if (lines.includes(text)) return;
  lines.push(text);
}

function joinLines(lines: string[]): string {
  return lines.map((l) => l.trim()).filter(Boolean).join('\n').trim();
}

function pickFirstNonEmpty(...values: unknown[]): string {
  for (const v of values) {
    const s = safeTrim(v);
    if (s) return s;
  }
  return '';
}

function cardPayloadText(type: string, payload: Record<string, any>): string {
  const lines: string[] = [];

  switch (type) {
    case 'app/x-rss-card': {
      pushUnique(lines, safeTrim(payload.feed_title || payload.webhookName));
      pushUnique(lines, safeTrim(payload.title));
      pushUnique(lines, safeTrim(payload.summary));
      pushUnique(lines, safeTrim(payload.url));
      return joinLines(lines);
    }

    case 'app/x-twitter-card': {
      const authorName = safeTrim(payload.author_name);
      const authorHandle = safeTrim(payload.author_handle);
      const authorLabel =
        authorName && authorHandle ? `${authorName} (@${authorHandle})` : authorName ? authorName : authorHandle ? `@${authorHandle}` : '';

      const text = safeTrim(payload.text);
      const url = safeTrim(payload.url);
      if (authorLabel && text) pushUnique(lines, `${authorLabel}: ${text}`);
      else pushUnique(lines, text);

      const quoted = safeRecord(payload.quoted_tweet ?? payload.quotedTweet);
      if (quoted) {
        const qtAuthorName = safeTrim(quoted.author_name);
        const qtAuthorHandle = safeTrim(quoted.author_handle);
        const qtAuthorLabel =
          qtAuthorName && qtAuthorHandle ? `${qtAuthorName} (@${qtAuthorHandle})` : qtAuthorName ? qtAuthorName : qtAuthorHandle ? `@${qtAuthorHandle}` : '';
        const quotedText = safeTrim(quoted.text);
        if (quotedText) {
          pushUnique(lines, qtAuthorLabel ? `Quoted ${qtAuthorLabel}: ${quotedText}` : `Quoted: ${quotedText}`);
        }
        pushUnique(lines, safeTrim(quoted.url));
      }

      pushUnique(lines, url);
      return joinLines(lines);
    }

    case 'app/x-bilibili-card': {
      const authorName = safeTrim(payload.author_name || payload.webhookName);
      const title = safeTrim(payload.title);
      const text = pickFirstNonEmpty(payload.text, payload.summary, payload.description);
      const original = safeRecord(payload.original_post);
      const originalText = original ? pickFirstNonEmpty(original.text, original.summary, original.description) : '';

      pushUnique(lines, authorName);
      pushUnique(lines, title);
      pushUnique(lines, text);
      if (originalText) pushUnique(lines, `Quoted: ${originalText}`);
      pushUnique(lines, pickFirstNonEmpty(payload.dynamic_url, payload.url));
      return joinLines(lines);
    }

    case 'app/x-instagram-card': {
      const username = safeTrim(payload.username);
      const fullName = safeTrim(payload.full_name);
      const content = pickFirstNonEmpty(payload.content, payload.title);
      const biography = safeTrim(payload.biography);
      const profileUrl = username ? `https://www.instagram.com/${username}/` : '';

      pushUnique(lines, fullName);
      pushUnique(lines, username ? `@${username}` : '');
      pushUnique(lines, content);
      pushUnique(lines, biography);
      pushUnique(lines, profileUrl);
      return joinLines(lines);
    }

    case 'app/x-pornhub-card': {
      pushUnique(lines, safeTrim(payload.title));
      pushUnique(lines, safeTrim(payload.url));
      return joinLines(lines);
    }

    case 'app/x-jpdict-card': {
      pushUnique(lines, safeTrim(payload.content));
      return joinLines(lines);
    }

    default: {
      // Generic best-effort for other app cards (or unknown payload shapes).
      pushUnique(lines, safeTrim(payload.title));
      pushUnique(lines, pickFirstNonEmpty(payload.text, payload.summary, payload.description, payload.caption, payload.content));
      pushUnique(lines, safeTrim(payload.url));
      return joinLines(lines);
    }
  }
}

export function getMessageBestEffortText(message: Message): string {
  const lines: string[] = [];

  const content = safeTrim(message.content);
  const plainText = safeTrim(message.plainText);
  const payload = safeRecord(message.payload);

  // 1) Direct content first (what the user likely typed).
  pushUnique(lines, content);

  // 2) Voice messages: prefer transcript if present.
  if (message.type === 'message/voice') {
    pushUnique(lines, plainText);
  }

  // 3) Common payload fields.
  if (payload) {
    pushUnique(lines, safeTrim(payload.content));
    pushUnique(lines, safeTrim(payload.url));

    // Forward-card: use embedded message as context.
    const forwarded = safeRecord(payload.forwardedMessage);
    if (forwarded) {
      // Avoid unbounded recursion: forwarded card typically embeds a plain message payload.
      const forwardedMessage = forwarded as unknown as Message;
      pushUnique(lines, getMessageBestEffortText(forwardedMessage));
    }

    // For app cards, pull useful visible fields (title/summary/text/etc).
    if (typeof message.type === 'string' && message.type.startsWith('app/x-')) {
      pushUnique(lines, cardPayloadText(message.type, payload));
    }
  }

  return joinLines(lines);
}

