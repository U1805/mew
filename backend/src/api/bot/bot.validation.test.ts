import { describe, it, expect } from 'vitest';
import { BotType } from './bot.model';
import { createBotSchema, updateBotSchema } from './bot.validation';

describe('bot.validation', () => {
  it('createBotSchema accepts valid payload and preprocesses dmEnabled', () => {
    const parsed = createBotSchema.parse({
      body: {
        name: 'My Bot',
        botType: BotType.Custom,
        dmEnabled: 'true',
        config: '{"a":1}',
      },
    });

    expect(parsed.body.dmEnabled).toBe(true);
    expect(parsed.body.config).toBe('{"a":1}');
  });

  it('createBotSchema rejects too-short name', () => {
    expect(() => createBotSchema.parse({ body: { name: 'a' } })).toThrow();
  });

  it('createBotSchema rejects invalid JSON config', () => {
    expect(() => createBotSchema.parse({ body: { name: 'ok', config: '{bad' } })).toThrow('Config must be a valid JSON string');
  });

  it('updateBotSchema allows partial updates', () => {
    const parsed = updateBotSchema.parse({ body: { dmEnabled: true } });
    expect(parsed.body.dmEnabled).toBe(true);
  });
});

