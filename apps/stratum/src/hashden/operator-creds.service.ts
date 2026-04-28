// NestJS wrapper around @hashden/crypto. Loads the master key once at
// startup and exposes encrypt / decrypt for the groups controller and
// HashdenService.
//
// Backwards-compat: decrypt() returns the input as-is when the wire
// string isn't in our v1 format. That covers Group rows persisted before
// encryption was wired in. Once we're confident every row is encrypted
// (or migrated), we can flip a strict mode that throws on unknown shape.

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  decryptOperatorCred,
  encryptOperatorCred,
  isEncryptedWire,
  parseMasterKey,
} from '@hashden/crypto';

@Injectable()
export class OperatorCredsService {
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    const hex = config.get<string>('OPERATOR_CREDS_ENC_KEY');
    if (!hex) {
      // Permit boot without the key for dev convenience, but throw on
      // any actual encrypt/decrypt call. Logs a loud warning.
      console.warn(
        '[hashden] OPERATOR_CREDS_ENC_KEY not set — operator credentials will be persisted in PLAINTEXT. Set this env var for production.',
      );
      this.key = null;
    } else {
      this.key = parseMasterKey(hex);
    }
  }

  /** Encrypts a plaintext for at-rest storage. Throws if the master key
   *  isn't configured — callers should null-check `available` first if
   *  they want to allow plaintext writes in dev. */
  encrypt(plaintext: string): string {
    if (!this.key) {
      throw new Error(
        'OPERATOR_CREDS_ENC_KEY env var not set; cannot encrypt',
      );
    }
    return encryptOperatorCred(plaintext, this.key);
  }

  /** Decrypts a wire string. If the input isn't in our encrypted format,
   *  returns it as-is — covers legacy plaintext rows persisted before
   *  encryption was wired up. */
  decrypt(wire: string): string {
    if (!isEncryptedWire(wire)) return wire;
    if (!this.key) {
      throw new Error(
        'wire is encrypted but OPERATOR_CREDS_ENC_KEY env var not set',
      );
    }
    return decryptOperatorCred(wire, this.key);
  }

  get available(): boolean {
    return this.key != null;
  }
}
