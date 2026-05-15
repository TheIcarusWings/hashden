// Operator-credential encryption-at-rest.
//
// AES-256-GCM with a server-side master key (32 bytes). Used for:
//   - Group.operatorRpcAuth (operator's Bitcoin RPC user:pass)
//   - Group.operatorLnSecret  (operator's LNbits "apiUrl|adminKey" or NWC URI)
//
// Wire format (versioned for future rotation):
//   v1:<iv-hex>:<tag-hex>:<ciphertext-hex>
// IV is 12 bytes (GCM standard); tag is 16 bytes; ciphertext is variable.
//
// The master key is loaded from env (OPERATOR_CREDS_ENC_KEY) at process
// start. Compromise model: anyone with the env var can decrypt every
// operator's credentials. That's the same trust level operators already
// extend to the platform when they paste their key in. A future hardening
// path is per-operator client-side encryption with a NIP-44-derived key,
// but that breaks server-orchestrated dust fan-out (operator must be
// online to decrypt). Documented as a Week-9-launch open question.

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALG = "aes-256-gcm";
const IV_BYTES = 12;
const KEY_BYTES = 32;
const VERSION = "v1";

export class OperatorCredsCryptoError extends Error {
  constructor(
    message: string,
    readonly cause?: "BAD_KEY" | "BAD_FORMAT" | "BAD_VERSION" | "AUTH_FAILED",
  ) {
    super(message);
    this.name = "OperatorCredsCryptoError";
  }
}

/** Validates + parses a hex master key into a 32-byte Buffer. */
export function parseMasterKey(hex: string): Buffer {
  if (typeof hex !== "string") {
    throw new OperatorCredsCryptoError("master key must be a string", "BAD_KEY");
  }
  const trimmed = hex.trim();
  if (!/^[0-9a-fA-F]+$/.test(trimmed)) {
    throw new OperatorCredsCryptoError(
      "master key must be hex chars only",
      "BAD_KEY",
    );
  }
  const buf = Buffer.from(trimmed, "hex");
  if (buf.length !== KEY_BYTES) {
    throw new OperatorCredsCryptoError(
      `master key must decode to ${KEY_BYTES} bytes (got ${buf.length})`,
      "BAD_KEY",
    );
  }
  return buf;
}

/**
 * Encrypts plaintext with AES-256-GCM. Returns the v1 wire string.
 * The `key` is the parsed master key (use parseMasterKey to validate
 * the env var once at startup).
 */
export function encryptOperatorCred(plaintext: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new OperatorCredsCryptoError("invalid key length", "BAD_KEY");
  }
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALG, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

/**
 * Decrypts a v1 wire string back to plaintext. Throws
 * OperatorCredsCryptoError with a typed cause on any malformed input or
 * authentication-tag mismatch.
 */
export function decryptOperatorCred(wire: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new OperatorCredsCryptoError("invalid key length", "BAD_KEY");
  }
  const parts = wire.split(":");
  if (parts.length !== 4) {
    throw new OperatorCredsCryptoError(
      "expected v1:iv:tag:ct format",
      "BAD_FORMAT",
    );
  }
  const [version, ivHex, tagHex, ctHex] = parts;
  if (version !== VERSION) {
    throw new OperatorCredsCryptoError(
      `unsupported version ${version}`,
      "BAD_VERSION",
    );
  }
  let iv: Buffer, tag: Buffer, ct: Buffer;
  try {
    iv = Buffer.from(ivHex!, "hex");
    tag = Buffer.from(tagHex!, "hex");
    ct = Buffer.from(ctHex!, "hex");
  } catch {
    throw new OperatorCredsCryptoError("invalid hex", "BAD_FORMAT");
  }
  if (iv.length !== IV_BYTES) {
    throw new OperatorCredsCryptoError(
      `iv must be ${IV_BYTES} bytes`,
      "BAD_FORMAT",
    );
  }
  if (tag.length !== 16) {
    throw new OperatorCredsCryptoError("tag must be 16 bytes", "BAD_FORMAT");
  }
  const decipher = createDecipheriv(ALG, key, iv);
  decipher.setAuthTag(tag);
  try {
    const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    throw new OperatorCredsCryptoError(
      "GCM authentication failed (wrong key or tampered ciphertext)",
      "AUTH_FAILED",
    );
  }
}

/** True if the wire string looks like our format. Lets callers
 *  distinguish legacy plaintext rows from encrypted rows during a rolling
 *  migration. (We treat anything not matching as plaintext for backwards
 *  compatibility with pre-encryption Group rows.) */
export function isEncryptedWire(s: string): boolean {
  return /^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/.test(s);
}
