<!--
  Thanks for sending a PR. Quick checklist:

  - PRs target the `dev` branch (not `main`).
  - For non-trivial changes, an issue exists where the approach was discussed.
  - `pnpm typecheck && pnpm test && pnpm build` pass locally.
  - Gitleaks pre-commit hook is enabled (`git config core.hooksPath .githooks`).
-->

## Summary

<!-- One or two sentences: what changes and why. Save details for below. -->

## Linked issue

Fixes #

## What this changes

<!--
  Bullet the user-visible / API-visible / operator-visible changes.
  Don't restate the diff — explain the choices.
-->

-
-

## What this doesn't change

<!-- The surface area you deliberately left alone. Helps reviewers know where to focus. -->

## Test plan

- [ ] Added/updated tests in `*.test.ts`
- [ ] `pnpm typecheck` green
- [ ] `pnpm test` green
- [ ] `pnpm build` green
- [ ] If stratum/payouts touched: ran the regtest harness in `infrastructure/regtest/`
- [ ] If web touched: verified the affected page in a browser
- [ ] If payout math touched: explain how you convinced yourself it can't double-pay

## Risk

<!--
  Be honest. Where could this go wrong? What's the blast radius if it does?
  "I don't see how this could break anything" is suspicious — usually wrong.
-->

## Notes for the reviewer

<!-- Anything you want a second pair of eyes on. -->
