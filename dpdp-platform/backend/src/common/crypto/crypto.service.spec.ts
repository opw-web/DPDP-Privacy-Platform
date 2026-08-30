import { ConfigService } from "@nestjs/config";
import {
  CryptoService,
  InvalidEncryptionKeyError,
  MalformedCiphertextError,
} from "./crypto.service";

/** A valid 32-byte key, base64-encoded, distinct from the real `.env` value. */
const VALID_KEY_B64 = Buffer.alloc(32, 7).toString("base64");

function makeService(encryptionKey = VALID_KEY_B64): CryptoService {
  const configService = {
    get: () => ({ encryptionKey }),
  } as unknown as ConfigService;
  return new CryptoService(configService);
}

describe("CryptoService", () => {
  it("round-trips a plaintext through encrypt() then decrypt()", () => {
    const service = makeService();
    const plaintext = "sk_live_super_secret_api_key_12345";

    const cipher = service.encrypt(plaintext);
    const decrypted = service.decrypt(cipher);

    expect(decrypted).toBe(plaintext);
  });

  it("produces a DIFFERENT ciphertext for the same plaintext encrypted twice (random IV), and both still decrypt correctly", () => {
    const service = makeService();
    const plaintext = "same-secret-value";

    const cipherA = service.encrypt(plaintext);
    const cipherB = service.encrypt(plaintext);

    // NEGATIVE: the two ciphertexts must not be identical.
    expect(cipherA).not.toBe(cipherB);
    // POSITIVE CONTROL: both are still genuinely valid encryptions of the
    // same plaintext, not just "different because one is garbage."
    expect(service.decrypt(cipherA)).toBe(plaintext);
    expect(service.decrypt(cipherB)).toBe(plaintext);
  });

  it("fails the auth tag on a tampered ciphertext, but decrypts the SAME untampered ciphertext successfully (positive control)", () => {
    const service = makeService();
    const plaintext = "do-not-corrupt-me";
    const cipher = service.encrypt(plaintext);

    // POSITIVE CONTROL first: prove this exact ciphertext string is
    // genuinely valid before tampering with it.
    expect(service.decrypt(cipher)).toBe(plaintext);

    const [ivPart, authTagPart, dataPart] = cipher.split(".");
    const tamperedDataBuf = Buffer.from(dataPart ?? "", "base64");
    tamperedDataBuf[0] = (tamperedDataBuf[0] ?? 0) ^ 0xff;
    const tampered = `${ivPart}.${authTagPart}.${tamperedDataBuf.toString("base64")}`;

    // NEGATIVE: flipping a single byte of ciphertext must make
    // decryption throw -- never silently return corrupted plaintext.
    expect(() => service.decrypt(tampered)).toThrow();
  });

  it("rejects a ciphertext string that isn't in the iv.authTag.data format", () => {
    const service = makeService();
    expect(() => service.decrypt("not-a-real-ciphertext")).toThrow(
      MalformedCiphertextError,
    );
  });

  it("refuses to construct when ENCRYPTION_KEY does not decode to 32 bytes", () => {
    const tooShort = Buffer.alloc(16, 1).toString("base64");
    expect(() => makeService(tooShort)).toThrow(InvalidEncryptionKeyError);

    // POSITIVE CONTROL: the real 32-byte key still constructs fine.
    expect(() => makeService()).not.toThrow();
  });
});
