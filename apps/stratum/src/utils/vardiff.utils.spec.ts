import { ConfigService } from '@nestjs/config';

import {
  DEFAULT_VARDIFF_GRACE_MS,
  DEFAULT_VARDIFF_TARGET_SECONDS_PER_SHARE,
  getVardiffGraceMs,
  getVardiffTargetSecondsPerShare,
} from './vardiff.utils';

// Minimal ConfigService stand-in: only .get(key) is exercised.
function cfg(values: Record<string, unknown>): ConfigService {
  return { get: (k: string) => values[k] } as unknown as ConfigService;
}

describe('vardiff.utils', () => {
  describe('getVardiffTargetSecondsPerShare', () => {
    it('defaults when unset', () => {
      expect(getVardiffTargetSecondsPerShare(cfg({}))).toBe(DEFAULT_VARDIFF_TARGET_SECONDS_PER_SHARE);
    });

    it('parses a configured value', () => {
      expect(getVardiffTargetSecondsPerShare(cfg({ VARDIFF_TARGET_SECONDS_PER_SHARE: '30' }))).toBe(30);
    });

    it('falls back on non-positive or non-finite values', () => {
      expect(getVardiffTargetSecondsPerShare(cfg({ VARDIFF_TARGET_SECONDS_PER_SHARE: '0' }))).toBe(DEFAULT_VARDIFF_TARGET_SECONDS_PER_SHARE);
      expect(getVardiffTargetSecondsPerShare(cfg({ VARDIFF_TARGET_SECONDS_PER_SHARE: '-5' }))).toBe(DEFAULT_VARDIFF_TARGET_SECONDS_PER_SHARE);
      expect(getVardiffTargetSecondsPerShare(cfg({ VARDIFF_TARGET_SECONDS_PER_SHARE: 'abc' }))).toBe(DEFAULT_VARDIFF_TARGET_SECONDS_PER_SHARE);
    });
  });

  describe('getVardiffGraceMs', () => {
    it('defaults when unset', () => {
      expect(getVardiffGraceMs(cfg({}))).toBe(DEFAULT_VARDIFF_GRACE_MS);
    });

    it('parses a configured value, including 0 (strict mode)', () => {
      expect(getVardiffGraceMs(cfg({ VARDIFF_GRACE_MS: '5000' }))).toBe(5000);
      expect(getVardiffGraceMs(cfg({ VARDIFF_GRACE_MS: '0' }))).toBe(0);
    });

    it('falls back on negative or non-finite values', () => {
      expect(getVardiffGraceMs(cfg({ VARDIFF_GRACE_MS: '-1' }))).toBe(DEFAULT_VARDIFF_GRACE_MS);
      expect(getVardiffGraceMs(cfg({ VARDIFF_GRACE_MS: 'nope' }))).toBe(DEFAULT_VARDIFF_GRACE_MS);
    });
  });
});
