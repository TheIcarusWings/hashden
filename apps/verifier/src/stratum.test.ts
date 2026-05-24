import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseLine,
  parseSubscribeResult,
  parseMiningNotify,
} from "./stratum.js";

test("parseLine handles blanks and junk", () => {
  assert.equal(parseLine(""), null);
  assert.equal(parseLine("   "), null);
  assert.equal(parseLine("not json"), null);
  assert.deepEqual(parseLine('{"a":1}'), { a: 1 });
});

test("parseSubscribeResult extracts extranonce1 + size", () => {
  const msg = {
    id: 1,
    result: [[["mining.notify", "abc"]], "a1b2c3d4", 8],
    error: null,
  };
  assert.deepEqual(parseSubscribeResult(msg), {
    extranonce1: "a1b2c3d4",
    extranonce2Size: 8,
  });
});

test("parseSubscribeResult ignores non-subscribe results", () => {
  assert.equal(parseSubscribeResult({ id: 2, result: true, error: null }), null);
  assert.equal(parseSubscribeResult({ method: "mining.notify", params: [] }), null);
  // bad extranonce / size
  assert.equal(
    parseSubscribeResult({ result: [[], "zzzz", 8] }),
    null,
  );
  assert.equal(parseSubscribeResult({ result: [[], "a1b2", 0] }), null);
});

test("parseMiningNotify extracts the job fields", () => {
  const msg = {
    id: null,
    method: "mining.notify",
    params: [
      "job1",
      "prevhash",
      "01000000...cb1",
      "cb2...outputs",
      ["branch1", "branch2"],
      "20000000",
      "1703c2a4",
      "65b0f1aa",
      true,
    ],
  };
  const job = parseMiningNotify(msg);
  assert.ok(job);
  assert.equal(job!.jobId, "job1");
  assert.equal(job!.coinbase1, "01000000...cb1");
  assert.equal(job!.coinbase2, "cb2...outputs");
  assert.deepEqual(job!.merkleBranches, ["branch1", "branch2"]);
  assert.equal(job!.cleanJobs, true);
});

test("parseMiningNotify ignores other methods / malformed params", () => {
  assert.equal(parseMiningNotify({ method: "mining.set_difficulty", params: [512] }), null);
  assert.equal(parseMiningNotify({ method: "mining.notify", params: ["only", "three"] }), null);
});
