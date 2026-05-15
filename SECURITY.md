# Security policy

Hashden is in open alpha. The codebase touches Bitcoin block payouts, Lightning fan-out, operator credentials, and Nostr signing — there is real money on the line. Responsible disclosure helps everyone; we take it seriously.

## How to report

**Do not open a public GitHub issue for security-sensitive findings.**

Send the report by Nostr DM to the maintainer:

```
npub19tzp8lf3klmqj3dz9mz0qnuvjp7uyy9993gmljmyaxs8phztj7wsnujvq5
```

([Open in Primal](https://primal.net/p/npub19tzp8lf3klmqj3dz9mz0qnuvjp7uyy9993gmljmyaxs8phztj7wsnujvq5) · [Open in Iris](https://iris.to/npub19tzp8lf3klmqj3dz9mz0qnuvjp7uyy9993gmljmyaxs8phztj7wsnujvq5))

If you don't have a Nostr identity you trust for sensitive material, mention that in your DM and we'll move to whatever channel works.

## What to include

- A clear description of the issue and where it lives (file, function, deployed surface).
- A reproduction: command, request, share, or sequence of clicks that triggers it.
- The impact: what can an attacker do? Who gets hurt?
- Suggested fix, if you have one. Not required.

## What we treat as security-sensitive

In rough priority order:

1. **Theft or redirection of block rewards.** Any way to make a coinbase pay an attacker, mis-weight a member, double-pay, or skip a member who's owed.
2. **Operator credential exposure.** Plaintext leaks of `OPERATOR_CREDS_ENC_KEY`, decrypted LNbits / NWC keys, the project `PROJECT_NSEC_HEX`, or Bitcoin RPC creds.
3. **Stratum auth or routing bypass.** Forging a share against a different member's pubkey; injecting yourself into a den you're not a member of; rerouting another den's shares to your group.
4. **Nostr signing or event forgery.** Convincing the platform to sign a kind-1 or kind-9735 event it shouldn't, or accepting an unsigned event as authoritative.
5. **Idempotency violations** that let a payout be sent more than once for the same `(block, member)` pair.
6. **Denial of service that affects payouts.** Causing a matured block to never get processed, indefinitely.

## What's out of scope

- Dependency CVEs with no exploitable path through Hashden (file an issue, but don't treat as private).
- Issues in upstream `public-pool` that don't manifest through `apps/stratum/`'s extended surface — those belong upstream.
- DoS via flooding stratum with garbage connections — rate-limiting is best-effort; if you find an amplification vector or a way to cheaply crash the process, that's in scope.
- "I could spam a relay" — Nostr relays are independently operated, not part of Hashden's trust surface.

## What you can expect from us

- **Acknowledgement within 72 hours** via Nostr DM.
- **A first-look assessment within 1 week.** Either "yes, working on it", "yes but it's lower priority because X", or "no, here's why this isn't an issue".
- **Coordinated disclosure.** We'll agree a fix window with you (typically ≤90 days) before any public discussion.
- **Credit in the release notes** if you'd like it. Pseudonymous credit (Nostr npub, GitHub handle, custom name) is fine. Anonymous is also fine.

## What we ask of you

- Don't exploit the issue beyond what's needed to demonstrate it.
- Don't move funds that aren't yours.
- Don't access data that isn't yours.
- Hold the issue private until we've agreed it's safe to disclose.

No bug bounty (this is a single-maintainer open alpha), but everything else above is real.

## Signing key

Hashden's block-found notes and NIP-57 zap receipts are signed by the maintainer's Nostr key:

`npub19tzp8lf3klmqj3dz9mz0qnuvjp7uyy9993gmljmyaxs8phztj7wsnujvq5`

Verify against it when checking authenticity of any Hashden-published Nostr event. The same key receives security-disclosure DMs (see above).
