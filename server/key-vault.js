const crypto = require('crypto');

const SECRET = String(process.env.ASTRA_KEY_ENCRYPTION_SECRET || process.env.SESSION_SECRET || '');

function encryptionKey() {
  if (SECRET.length < 32) throw new Error('SESSION_SECRET must be configured with at least 32 characters.');
  return crypto.createHash('sha256').update(`rockstar-ai-astra-key-v1:${SECRET}`).digest();
}

function encryptSecret(value) {
  const key = encryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1.${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

function decryptSecret(payload) {
  if (!payload) return '';
  try {
    const [version, ivText, tagText, dataText] = String(payload).split('.');
    if (version !== 'v1' || !ivText || !tagText || !dataText) return '';
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataText, 'base64url')),
      decipher.final()
    ]).toString('utf8');
  } catch {
    return '';
  }
}

module.exports = { encryptSecret, decryptSecret };
