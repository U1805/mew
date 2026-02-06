import crypto from 'crypto';

const sha256Hex = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

export const hashBotAccessToken = (raw: string): string => sha256Hex(raw);

const deriveAesKey = (keyMaterial: string): Buffer => crypto.createHash('sha256').update(`mew:bot-access-token:${keyMaterial}`, 'utf8').digest();

export const encryptBotAccessToken = (raw: string, keyMaterial: string): string => {
  const key = deriveAesKey(keyMaterial);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${ciphertext.toString('base64url')}.${tag.toString('base64url')}`;
};

export const decryptBotAccessToken = (enc: string, keyMaterial: string): string => {
  const parts = (enc || '').split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid bot token ciphertext');
  }
  const [ivB64, ctB64, tagB64] = parts;
  const iv = Buffer.from(ivB64, 'base64url');
  const ciphertext = Buffer.from(ctB64, 'base64url');
  const tag = Buffer.from(tagB64, 'base64url');

  const key = deriveAesKey(keyMaterial);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
};

