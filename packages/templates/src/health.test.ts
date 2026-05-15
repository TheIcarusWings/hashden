import { test } from "node:test";
import assert from "node:assert/strict";
import { TemplateSourceHealth } from "./health.js";

function clock() {
  let t = 1_000_000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

test("fresh source: shouldFallback=false", () => {
  const h = new TemplateSourceHealth();
  assert.equal(h.shouldFallback("op-1"), false);
});

test("3 failures (default threshold) → fallback", () => {
  const h = new TemplateSourceHealth();
  h.recordFailure("op-1");
  assert.equal(h.shouldFallback("op-1"), false);
  h.recordFailure("op-1");
  assert.equal(h.shouldFallback("op-1"), false);
  h.recordFailure("op-1");
  assert.equal(h.shouldFallback("op-1"), true);
});

test("custom threshold", () => {
  const h = new TemplateSourceHealth({ failureThreshold: 1 });
  h.recordFailure("op-1");
  assert.equal(h.shouldFallback("op-1"), true);
});

test("success resets failures + clears fallback", () => {
  const h = new TemplateSourceHealth();
  h.recordFailure("op-1");
  h.recordFailure("op-1");
  h.recordFailure("op-1");
  assert.equal(h.shouldFallback("op-1"), true);
  h.recordSuccess("op-1");
  assert.equal(h.shouldFallback("op-1"), false);
  const snap = h.inspect("op-1");
  assert.equal(snap?.consecutiveFailures, 0);
});

test("after retryAfterMs since last failure, give the source another shot", () => {
  const c = clock();
  const h = new TemplateSourceHealth({
    failureThreshold: 1,
    retryAfterMs: 60_000,
    now: c.now,
  });
  h.recordFailure("op-1");
  assert.equal(h.shouldFallback("op-1"), true);
  c.advance(30_000);
  assert.equal(h.shouldFallback("op-1"), true);
  c.advance(30_001);
  // Total 60_001ms past the failure → cleared to retry.
  assert.equal(h.shouldFallback("op-1"), false);
});

test("multiple sources tracked independently", () => {
  const h = new TemplateSourceHealth({ failureThreshold: 1 });
  h.recordFailure("op-A");
  assert.equal(h.shouldFallback("op-A"), true);
  assert.equal(h.shouldFallback("op-B"), false);
});

test("inspect returns a snapshot copy (mutating it doesn't change tracker)", () => {
  const h = new TemplateSourceHealth();
  h.recordFailure("op-1");
  const snap = h.inspect("op-1")!;
  snap.consecutiveFailures = 999;
  const snap2 = h.inspect("op-1")!;
  assert.equal(snap2.consecutiveFailures, 1);
});

test("inspect returns null for unknown key", () => {
  const h = new TemplateSourceHealth();
  assert.equal(h.inspect("never-touched"), null);
});
