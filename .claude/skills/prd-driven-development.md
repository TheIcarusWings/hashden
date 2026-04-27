---
name: prd-driven-development
description: "Use BEFORE writing any new feature, API endpoint, React component, page, composer, dashboard tab, database migration, NIP integration, or anything that adds or changes product behavior in Nostreon. Reads PRD.md first to ground the work in current state and roadmap, checks compatibility with existing functionality, prevents accidental regressions, and updates PRD.md to mark gaps as resolved or add newly discovered ones. Use whenever the user says 'build', 'add', 'create', 'implement', 'ship', 'wire up', 'extend', 'support', or 'enable' something product-facing."
---

# Skill: PRD-Driven Development

You are working in the Nostreon repo, which has a living Product Requirements Document at the repo root: [`PRD.md`](../../PRD.md). The PRD is the source of truth for what the product is, what's already built, what's a known gap, and what's planned. This skill exists to make sure the PRD stays alive and accurate as the product evolves — not a write-once-and-forget artifact.

## When this skill triggers

Any task that adds or changes product behavior. Concretely:
- New API endpoints (anything under `apps/web/src/app/api/`)
- New React components in `apps/web/src/components/`
- New pages in `apps/web/src/app/`
- New database migrations in `supabase/migrations/`
- New event kinds, NIP integrations, or relay logic
- New dashboard tabs, composers, or content types
- New protocol/NIP work in `packages/shared/`
- Anything the user describes with verbs like "build," "add," "create," "implement," "ship," "wire up," "extend," "support," "enable"

It does **not** trigger for:
- Pure bug fixes (use the bugfix flow)
- Refactors with no product behavior change
- Test additions
- Documentation that isn't the PRD itself

## The 5-step workflow

### 1. Read the PRD first

Before writing any code, read [`PRD.md`](../../PRD.md) end to end. Specifically check:

- **Section 1 (Platform Capabilities)** — does the thing you're about to build already exist on one surface but not the other? Is it marked as ✅, ⚠️, or ❌?
- **Section 2/3 (Creator/Subscriber Experience)** — is this work listed as a P0/P1/P2/P3 gap, a planned improvement, or a future-state item?
- **Section 4 (Prioritized Gaps & Roadmap)** — is the task you're about to do already numbered there?
- **Section 6 (Out of Scope / Non-Goals)** — does the task contradict an explicit non-goal? (Example: a creator-side API for partners is an explicit non-goal. If the user asks for it, push back politely with the PRD reference before building.)

If you can't tell whether the work fits the PRD, **ask the user one specific clarifying question before writing code**, citing the PRD section that's ambiguous.

### 2. Check compatibility with existing features

Before touching the codebase, identify what your work might collide with:

- **Will it change a Nostr event kind, tag schema, or NIP we already publish?** If yes, audit every consumer (composers, relay-auth, fetchers, the API v1 subscribe flow). The NIP compliance pass we already shipped is the source of truth for tag patterns — do not regress it.
- **Will it change an API contract?** Check if the v1 partner API or the hosted checkout depends on the response shape. Partners read these contracts; changing them silently is a breaking change.
- **Will it change a database table?** Check existing migrations and any RLS/grants. Day-zero is fine for breaking changes (no real creators yet), but the change must be a single migration that ships atomically.
- **Will it change a shared package export?** `@nostreon/shared` is consumed by both `apps/web` and `services/relay-auth`. Always rebuild shared with `npm run build` before type-checking the web app.

If the work depends on something not yet built, **stop and tell the user** — ordering matters and shipping the dependency first might be cheaper than a workaround.

### 3. Preserve what works

Default rule: **never break existing functionality unless the user explicitly says it's okay.**

- If a refactor would change observable behavior (event tags, API responses, UI flows, payment routing), name it explicitly to the user before doing it. Example: "This will change the kind 7003 receipt tag set, which we already documented for fiatjaf — confirm before I ship?"
- If you discover a function or component is no longer needed, do not delete it without asking. The user said "day zero" once; that doesn't make it a standing instruction.
- Run `npx tsc --noEmit -p apps/web/tsconfig.json` after your changes. Type-check failures are not "fix later" items.
- If your change affects publish or fetch logic, mentally walk through one full subscriber payment flow end-to-end (tier creation → subscribe → webhook → kind 1163 publish → relay-auth check → gated content read) and confirm nothing in that chain is broken.

### 4. Update the PRD when you close a gap

If what you just built was listed in the PRD as a gap, roadmap item, or future-state line, **edit PRD.md in the same commit** as the code change. Do not leave a "PRD update is a follow-up" todo — the PRD is the contract, and stale PRDs are worse than no PRD.

**Update format for resolved items:**

When a P0/P1/P2/P3 item ships, change its row in the gap table. Example before/after:

Before (in §3.2):
```markdown
| 🔴 No search UI — only an API | Users can't actually find creators by keyword | **P0** |
```

After:
```markdown
| ✅ ~~No search UI — only an API~~ Search UI shipped at `/search` (commit `abc1234`) | Users can find creators and articles by keyword | done |
```

Rules:
- Strikethrough the original gap text with `~~ ~~`
- Replace 🔴/🟡 with ✅
- Add a parenthetical reference to the commit short hash or PR number
- Replace the priority cell with `done`
- Don't delete the row — leaves a paper trail of what's been resolved
- For tables in §1.1 (capability matrix), flip the cell from ❌ / ⚠️ to ✅ and add a one-line note if the resolution is non-obvious

For roadmap items in §4 (Prioritized Gaps & Roadmap), do the same: strikethrough the numbered item and prepend ✅, e.g.:

```markdown
2. ✅ ~~**Search UI** backed by existing `/api/search` — Discovery gap~~ Shipped in commit abc1234.
```

### 5. Flag new gaps you discover

While implementing, you will sometimes notice things that *should* be in the PRD but aren't. Examples:
- A capability you needed to assume (an existing helper, an env var, a relay) that isn't documented
- A friction point in the flow you just touched
- An incompatibility between two features that nobody anticipated
- A new partner-facing concern (security, rate limiting, observability)

When you find one, **add it to the appropriate gaps section in PRD.md as part of the same commit**. Mark it with the priority you'd assign (🔴 P0, 🟡 P1, 🟡 P2, 🟡 P3) and a one-line impact statement. Do not silently fix it without recording it; future work will need to know it existed.

Format for adding a new gap to a table:

```markdown
| 🟡 New gap discovered while building X — short description | Why it matters in one line | P2 |
```

If the gap is significant enough that it changes the roadmap, also add a numbered entry to §4 with a brief justification. Tell the user in your end-of-task summary that you added it and why.

## What to write in your end-of-task summary

After completing PRD-driven work, your summary to the user should include:

1. **What you built** (one sentence)
2. **PRD impact** — which gap(s) you closed (with section reference) and which new gap(s) you added (if any)
3. **Compatibility check** — what you verified didn't break, especially anything cross-surface (web ↔ relay-auth, web ↔ partner API, content publish ↔ subscriber read)
4. **Anything you couldn't verify** — be honest about what you didn't test (e.g., "I didn't test the BTCPay webhook end-to-end against dev")

Example:

> Shipped the search UI page at `/search`. PRD impact: closes §3.2 gap "No search UI" (now ✅, marked done in commit `abc1234`). Discovered one new P2 gap while building: the `/api/search` endpoint has no rate limit — added to §3.2 as a 🟡 P2 row. Compatibility: confirmed it uses the existing `/api/search` endpoint without modifying its response shape. Didn't verify: search performance under load (no real data on dev yet).

## Anti-patterns to avoid

- ❌ **Don't write code first and update the PRD as a follow-up commit.** PRD updates and the code that closes the gap go in the same commit.
- ❌ **Don't read PRD.md once at the start of a long session and assume it's still current.** Re-read the relevant section every time you start a new task.
- ❌ **Don't silently expand scope.** If you find yourself building something the user didn't ask for because "it's also a gap," stop and ask first. The PRD is for tracking; the user owns prioritization.
- ❌ **Don't mark a gap as resolved if the resolution is partial.** If you only built half of what the gap requires, update the gap text to reflect the narrower remaining scope, don't delete it.
- ❌ **Don't add "TODO: update PRD" comments anywhere.** Either update the PRD now or don't claim the task is complete.

## When in doubt

If the task ambiguously fits the PRD, ask one clarifying question before writing code. The user will tell you whether they want the strict PRD-aligned version, a quick experiment outside the PRD scope (which they then need to add), or a deviation. All three are fine; what's not fine is shipping work that quietly contradicts the PRD without surfacing the conflict.
