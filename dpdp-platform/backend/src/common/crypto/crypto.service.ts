import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { AppConfig } from "../../config/configuration";

const ALGORITHM = "aes-256-gcm";
/** GCM's standard/recommended nonce length. A random one is generated per `encrypt()` call -- never reused. */
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;
const AUTH_TAG_LENGTH_BYTES = 16;

/**
 * Thrown by the constructor when `ENCRYPTION_KEY` does not decode (base64)
 * to exactly 32 bytes. `env.validation.ts` only checks the env var is a
 * non-empty string -- length/shape correctness for AES-256 is this
 * service's job, and it fails at boot (constructor time, via Nest's DI
 * container instantiating this as a singleton), not on the first
 * `encrypt()` call.
 */
export class InvalidEncryptionKeyError extends Error {
  constructor(actualByteLength: number) {
    super(
      `ENCRYPTION_KEY must be base64 for exactly ${KEY_LENGTH_BYTES} bytes ` +
        `(e.g. via 'openssl rand -base64 32'); decoded to ${actualByteLength} byte(s).`,
    );
    this.name = "InvalidEncryptionKeyError";
  }
}

/**
 * Thrown by `decrypt()` when the ciphertext string is not in this
 * service's own `iv.authTag.ciphertext` format -- distinct from the auth
 * tag failure below so a caller (and a test) can tell "this was never
 * something we encrypted" apart from "this WAS encrypted by us but has
 * been tampered with or corrupted."
 */
export class MalformedCiphertextError extends Error {
  constructor() {
    super(
      "Ciphertext is not in the expected " +
        '"<iv-base64>.<authTag-base64>.<data-base64>" format produced by ' +
        "CryptoService.encrypt().",
    );
    this.name = "MalformedCiphertextError";
  }
}

/**
 * AES-256-GCM encryption for `DataSource.credentialCipher` (spec line
 * 314: "NEVER returned by any API") and any other secret-at-rest this
 * codebase needs going forward.
 *
 * Format: `${ivBase64}.${authTagBase64}.${ciphertextBase64}` -- a single
 * opaque string so callers (and the `credentialCipher` column, which is a
 * plain `String?`) never need a second column for the IV or tag. The IV
 * is regenerated with `randomBytes` on every `encrypt()` call, so two
 * encryptions of the same plaintext never produce the same string. GCM's
 * auth tag is verified by `decipher.final()` inside `decrypt()` -- a
 * single flipped byte anywhere in the ciphertext, IV, or tag makes
 * `decrypt()` throw rather than silently returning corrupted plaintext.
 *
 * The key itself is decoded ONCE, in the constructor, from
 * `ENCRYPTION_KEY` (base64, 32 bytes) and held only in a private field --
 * never logged, never re-derived per call.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;

  constructor(configService: ConfigService) {
    const encodedKey = configService.get<AppConfig>("app")?.encryptionKey ?? "";
    const key = Buffer.from(encodedKey, "base64");
    if (key.length !== KEY_LENGTH_BYTES) {
      throw new InvalidEncryptionKeyError(key.length);
    }
    this.key = key;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, "utf8"),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString("base64"),
      authTag.toString("base64"),
      ciphertext.toString("base64"),
    ].join(".");
  }

  decrypt(cipher: string): string {
    const parts = cipher.split(".");
    if (parts.length !== 3) {
      throw new MalformedCiphertextError();
    }
    const [ivPart, authTagPart, dataPart] = parts as [string, string, string];
    const iv = Buffer.from(ivPart, "base64");
    const authTag = Buffer.from(authTagPart, "base64");
    const data = Buffer.from(dataPart, "base64");
    if (
      iv.length !== IV_LENGTH_BYTES ||
      authTag.length !== AUTH_TAG_LENGTH_BYTES
    ) {
      throw new MalformedCiphertextError();
    }

    const decipher = createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    // `decipher.final()` is where GCM verifies the auth tag -- a
    // tampered ciphertext, IV, or tag throws here (Node's
    // "Unauthenticated data" error), never returns corrupted plaintext.
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return plaintext.toString("utf8");
  }
}
