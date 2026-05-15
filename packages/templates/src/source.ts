// Source-selection logic.
//
// Given a group's stored config + the platform-default fallback, returns
// the concrete TemplateSource to fetch templates from. Pure function —
// no DB lookups (caller owns the group fetch); no decryption (caller
// owns operatorRpcAuth decryption). This package never touches the
// platform's encryption key.

import type { TemplateSource } from "./types.js";

export interface PlatformDefaults {
  url: string;
  auth: string;
}

/**
 * The shape of group fields that affect template-source selection. Caller
 * passes the relevant subset of a Prisma `Group` row; we don't import
 * @hashden/db here to keep this package zero-dep.
 */
export interface GroupTemplateConfig {
  templateSource: "PLATFORM_DEFAULT" | "OPERATOR_RPC";
  /** Operator's Bitcoin RPC URL (Core/Knots/Libre Relay or DATUM gateway). */
  operatorRpcUrl: string | null;
  /** Already-decrypted `user:pass` (caller decrypted from operatorRpcAuth). */
  operatorRpcAuth: string | null;
}

export function resolveTemplateSource(
  group: GroupTemplateConfig,
  platform: PlatformDefaults,
): TemplateSource {
  if (group.templateSource === "OPERATOR_RPC") {
    if (!group.operatorRpcUrl || !group.operatorRpcAuth) {
      throw new Error(
        "group.templateSource is OPERATOR_RPC but operatorRpcUrl or operatorRpcAuth is missing",
      );
    }
    return {
      kind: "OPERATOR_RPC",
      url: group.operatorRpcUrl,
      auth: group.operatorRpcAuth,
    };
  }
  // Default and unknown values fall back to the platform.
  return { kind: "PLATFORM_DEFAULT" };
}

/**
 * Materializes a TemplateSource into the concrete (url, auth) pair that
 * BitcoinRpcClient takes. Platform-default substitutes the platform's
 * own URL/auth.
 */
export function templateSourceEndpoint(
  source: TemplateSource,
  platform: PlatformDefaults,
): { url: string; auth: string } {
  if (source.kind === "OPERATOR_RPC") {
    return { url: source.url, auth: source.auth };
  }
  return { url: platform.url, auth: platform.auth };
}
