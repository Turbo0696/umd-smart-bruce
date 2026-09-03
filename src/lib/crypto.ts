import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Encrypts secrets we have to store per-row (a per-tutor Maizey API
// token — each instructor has their own Maizey account, so unlike
// TUTOR_API_KEY there's no single shared credential; see maizey.ts).
// AES-256-GCM: MAIZEY_TOKEN_ENCRYPTION_KEY is 32 random bytes, hex
// encoded (`openssl rand -hex 32`), never the token itself.
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // recommended nonce size for GCM

function getKey(): Buffer {
  const hex = process.env.MAIZEY_TOKEN_ENCRYPTION_KEY;
  if (!hex) {
    throw new Error("MAIZEY_TOKEN_ENCRYPTION_KEY is not set.");
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== 32) {
    throw new Error(
      `MAIZEY_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (got ${key.length}) — generate one with \`openssl rand -hex 32\`.`,
    );
  }
  return key;
}

// Output packs iv + authTag + ciphertext into one base64 string so the
// DB column only needs to hold a single opaque value.
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptSecret(packed: string): string {
  const buf = Buffer.from(packed, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const authTag = buf.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = buf.subarray(IV_LENGTH + 16);

  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
