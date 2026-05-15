# Contributing to Hashden

Thanks for your interest. Hashden is a small project run by a single maintainer right now, but it's built to be contributed to — bug reports, feature ideas, and code are all welcome.

## Quick links

- [Open an issue](https://github.com/TheIcarusWings/hashden/issues/new/choose)
- [Browse open issues](https://github.com/TheIcarusWings/hashden/issues)
- [Architecture doc](./ARCHITECTURE.md) — why the project exists, what's been decided
- [Roadmap](./ROADMAP.md) — what's planned next
- Nostr: [`npub19tz…jvq5`](https://primal.net/p/npub19tzp8lf3klmqj3dz9mz0qnuvjp7uyy9993gmljmyaxs8phztj7wsnujvq5) — DM the maintainer for short questions

## Reporting bugs

File a [bug report](https://github.com/TheIcarusWings/hashden/issues/new?template=bug_report.md) with as much of the following as you have:

- What you did, what you expected, what happened.
- Your environment: OS, Node version, browser (for `apps/web/` issues), mining hardware (for stratum issues).
- Relevant logs. **Scrub anything secret-looking before pasting** — the pre-commit hook isn't on GitHub forms.
- The den slug and your member pubkey, if the issue is on a live den.

For anything that looks like a security-sensitive bug (a way to steal block rewards, forge a payout, bypass a fee, leak operator credentials), please **don't open a public issue**. DM the maintainer's npub above instead — see [SECURITY.md](./SECURITY.md) for details.

## Suggesting features

[Feature request](https://github.com/TheIcarusWings/hashden/issues/new?template=feature_request.md). Tell us what you're trying to do and why; we'll figure out the "how" together. For anything bigger than a small change, please open an issue *before* writing the code — saves both sides time when we'd otherwise disagree on direction.

## Submitting code

1. **Open an issue first** for any change beyond a one-line fix. Discussion in the issue surfaces design questions early.
2. **Fork the repo**, branch from `dev` (not `main` — `main` tracks production deploys).
3. **Run the dev setup** from the [README](./README.md#try-it) — including `git config core.hooksPath .githooks` and `brew install gitleaks` so the pre-commit secret scan is active locally.
4. **Make the change.** Keep diffs focused: one PR per logical change. Don't combine drive-by refactors with feature work.
5. **Add tests.** New code paths get tests. We use Node's built-in test runner (`tsx --test src/**/*.test.ts`) — no Jest, no Vitest. Look at any `*.test.ts` file in `packages/` for the pattern.
6. **Run `pnpm typecheck && pnpm test && pnpm build`** before pushing. CI will also run these plus a gitleaks scan over full history.
7. **Open the PR** against `dev`. The [PR template](./.github/PULL_REQUEST_TEMPLATE.md) prompts for what we care about — summary, test plan, risk areas.

## Commit message style

[Conventional Commits](https://www.conventionalcommits.org/), kept terse:

```
<type>(<scope>): <imperative summary>

<optional body — why, tradeoffs, links>
```

Types we use: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `chore`, `copy`, `style`. Scopes are the directory or app: `web`, `stratum`, `payouts`, `coinbase`, `nostr`, `db`, `infra`, `ci`, `security`, `readme`.

Examples from the log:

```
feat(visibility): unlisted dens + dashboard auto-bookmark; fix intermittent 404
fix(ci): allowlist deterministic test fixture in gitleaks scan
chore(security): scrub leaked RPC password + drop upstream demo TLS
```

The body is for *why*, not *what* — the diff already shows the what.

## Code conventions

- **TypeScript strict everywhere.** No `any` without a comment explaining why.
- **No new dependencies without a reason in the PR description.** Existing deps stay pinned.
- **Comments are for non-obvious WHY.** If the code is self-explanatory, no comment. If something is surprising or workaround-y, explain.
- **Tests are integration-leaning where it matters** — encryption round-trips, coinbase fuzz cases, real-RPC smoke tests in `infrastructure/regtest/`. Pure unit tests are fine for pure functions.
- **No file you wouldn't want a stranger reading** — be deliberate about what goes in `.env.example` vs `.env`.

## License & contributions

By submitting a contribution, you agree to license it under [GPL-3.0-or-later](./LICENSE) (same as the project). No separate CLA. If you contribute on behalf of a company, ensure you have authority to do so.

## Code of conduct

Be kind, be specific, be patient. Disagree with code, not people. This is a small project; we don't need a 2000-word document to behave well. If something feels off, DM the maintainer.

## Acknowledgements

Contributors will be acknowledged in release notes and (when shipped) in the repo's contributor list. If you'd prefer to stay pseudonymous or use your Nostr npub, just say so in the PR.
