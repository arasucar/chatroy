import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const raw = process.env.USER_KEY_ENCRYPTION_KEY?.trim();
  if (!raw) {
    throw new Error("USER_KEY_ENCRYPTION_KEY must be set before storing provider keys.");
  }

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("USER_KEY_ENCRYPTION_KEY must decode to exactly 32 bytes.");
  }

  return key;
}

export function hasUserKeyEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const key = getEncryptionKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(".");
}

export function decryptSecret(payload: string): string {
  const [ivBase64, authTagBase64, encryptedBase64] = payload.split(".");
  if (!ivBase64 || !authTagBase64 || !encryptedBase64) {
    throw new Error("Encrypted secret payload is malformed.");
  }

  const key = getEncryptionKey();
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
