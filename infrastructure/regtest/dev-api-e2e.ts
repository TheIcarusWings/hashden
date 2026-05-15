// End-to-end driver against the deployed dev API.
//
// Exercises the full sig-verified create/join flow + the
// coinbase-preview endpoint (which round-trips through the live Bitcoin
// RPC and the @hashden/coinbase library). Doesn't require a regtest
// node — the deployed stack runs against mainnet Knots — so this is the
// fastest end-to-end check that the deployed API + DB + Bitcoin RPC are
// all wired correctly.
//
// Run:
//   pnpm tsx infrastructure/regtest/dev-api-e2e.ts
//
// Cleanup: this script does NOT auto-delete the test group it creates,
// because there's no delete endpoint. Test slugs are randomized per run
// so they never collide.

import { generateSecretKey, getPublicKey, finalizeEvent } from "nostr-tools/pure";
import { bytesToHex } from "@noble/hashes/utils";
import { buildGroupMetadataEvent } from "@hashden/nostr";
import { buildMemberRegistrationEvent } from "@hashden/nostr";

const API = process.env.HASHDEN_API_URL ?? "https://dev-api.hashden.app";

// Generic example mainnet P2WSH address — used as both operator and member
// BTC payout target so the coinbase-preview can build cleanly. Override via
// env if you want the previewed coinbase to actually pay an address you
// control on this test.
const TEST_BTC_ADDRESS =
  process.env.HASHDEN_E2E_BTC_ADDRESS ??
  "bc1qrp33g0q5c5txsp9arysrx4k6zdkfs4nce4xj0gdcccefvpysxf3qccfmv3";
const TEST_LN_ADDRESS = process.env.HASHDEN_E2E_LN_ADDRESS ?? "test@hashden.app";

function randomSlug(): string {
  return "e2e-" + Math.random().toString(36).slice(2, 10);
}

async function main() {
  const operatorSk = generateSecretKey();
  const operatorPk = getPublicKey(operatorSk);
  const memberSk = generateSecretKey();
  const memberPk = getPublicKey(memberSk);
  const slug = randomSlug();

  console.log(`[e2e] API=${API}`);
  console.log(`[e2e] slug=${slug}`);
  console.log(`[e2e] operator pubkey=${operatorPk.slice(0, 16)}…`);
  console.log(`[e2e] member pubkey=${memberPk.slice(0, 16)}…`);

  // 1. Build + sign the group-creation event.
  console.log("\n[1/5] POST /hashden/groups (kind-30078 sig-verified)");
  const groupUnsigned = buildGroupMetadataEvent({
    operatorPubkey: operatorPk,
    slug,
    content: {
      name: "E2E Test Group",
      description: "Created by infrastructure/regtest/dev-api-e2e.ts",
      fee_bps: 200,
      payout_rule: "SOLO_SHOWCASE",
      template_source: "PLATFORM_DEFAULT",
      operator_btc_address: TEST_BTC_ADDRESS,
    },
  });
  const groupSigned = finalizeEvent(groupUnsigned, operatorSk);
  let res = await fetch(`${API}/hashden/groups`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signedEvent: groupSigned }),
  });
  const createBody = await res.text();
  if (!res.ok) throw new Error(`POST groups failed ${res.status}: ${createBody}`);
  console.log(`    → ${res.status} ${createBody}`);

  // 2. GET it back.
  console.log("\n[2/5] GET /hashden/groups/" + slug);
  res = await fetch(`${API}/hashden/groups/${slug}`);
  const groupBody = await res.json();
  if (!res.ok) throw new Error(`GET group failed ${res.status}: ${JSON.stringify(groupBody)}`);
  if (groupBody.slug !== slug) throw new Error(`slug mismatch: ${groupBody.slug}`);
  if (groupBody.operatorPubkey !== operatorPk) throw new Error(`pubkey mismatch`);
  if (groupBody.payoutRule !== "SOLO_SHOWCASE") throw new Error(`payoutRule mismatch`);
  console.log(`    → ok; operator=${groupBody.operatorPubkey.slice(0, 16)}… rule=${groupBody.payoutRule}`);

  // 3. Build + sign member registration.
  console.log("\n[3/5] POST /hashden/groups/" + slug + "/members");
  const memberUnsigned = buildMemberRegistrationEvent({
    memberPubkey: memberPk,
    slug,
    content: {
      btc_address: TEST_BTC_ADDRESS,
      lightning_address: TEST_LN_ADDRESS,
    },
  });
  const memberSigned = finalizeEvent(memberUnsigned, memberSk);
  res = await fetch(`${API}/hashden/groups/${slug}/members`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ signedEvent: memberSigned }),
  });
  const memberBody = await res.text();
  if (!res.ok) throw new Error(`POST member failed ${res.status}: ${memberBody}`);
  console.log(`    → ${res.status} ${memberBody}`);

  // 4. coinbase-preview — exercises Bitcoin RPC + coinbase building on the live stack.
  console.log("\n[4/5] GET /hashden/groups/" + slug + "/coinbase-preview");
  res = await fetch(`${API}/hashden/groups/${slug}/coinbase-preview`);
  const previewBody = await res.json();
  if (!res.ok) throw new Error(`coinbase-preview failed ${res.status}: ${JSON.stringify(previewBody)}`);
  console.log(`    → reward=${previewBody.blockRewardSats}sats outputs=${previewBody.outputs?.length ?? 0} membersInWindow=${previewBody.membersInWindow} note="${previewBody.note ?? ""}"`);
  // blockRewardSats arrives as a decimal string for big-int safety. Mainnet
  // block subsidies are currently ~3.125 BTC (≈3.125e8 sats); fees push it
  // higher. Anything above 1.5 BTC = 1.5e8 sats indicates a real fetch
  // (vs. zero / placeholder / network failure).
  const rewardSats = parseInt(previewBody.blockRewardSats, 10);
  if (!Number.isFinite(rewardSats) || rewardSats < 150_000_000) {
    throw new Error(`unexpected blockRewardSats (mainnet should be ≥1.5 BTC): ${previewBody.blockRewardSats}`);
  }
  if (previewBody.group?.slug !== slug) {
    throw new Error(`group.slug mismatch in preview: got ${previewBody.group?.slug}`);
  }
  // SOLO_SHOWCASE with no shares → outputs=[]; that's correct, just means
  // no miner has connected yet. We only verified the RPC chain is live.

  // 5. Negative test: GET nonexistent slug → 404.
  console.log("\n[5/5] GET /hashden/groups/totally-fake (negative)");
  res = await fetch(`${API}/hashden/groups/totally-fake-${Date.now()}`);
  if (res.status !== 404) throw new Error(`expected 404 on missing group, got ${res.status}`);
  console.log(`    → 404 ✓`);

  console.log(`\n[e2e] ✅ all five checks green; deployed dev API is end-to-end functional.`);
  console.log(`[e2e] left behind test group: ${slug} (no delete endpoint; can be ignored)`);
}

main().catch((e) => {
  console.error("[e2e] FAILED:", e);
  process.exit(1);
});
