import { test } from "node:test";
import assert from "node:assert/strict";
import {
  resolveTemplateSource,
  templateSourceEndpoint,
} from "./source.js";

const PLATFORM = { url: "http://platform/", auth: "umbrel:platformpass" };

test("PLATFORM_DEFAULT → kind=PLATFORM_DEFAULT", () => {
  const r = resolveTemplateSource(
    {
      templateSource: "PLATFORM_DEFAULT",
      operatorRpcUrl: null,
      operatorRpcAuth: null,
    },
    PLATFORM,
  );
  assert.equal(r.kind, "PLATFORM_DEFAULT");
});

test("OPERATOR_RPC with both fields → kind=OPERATOR_RPC", () => {
  const r = resolveTemplateSource(
    {
      templateSource: "OPERATOR_RPC",
      operatorRpcUrl: "http://op-node/",
      operatorRpcAuth: "op:pass",
    },
    PLATFORM,
  );
  assert.equal(r.kind, "OPERATOR_RPC");
  if (r.kind === "OPERATOR_RPC") {
    assert.equal(r.url, "http://op-node/");
    assert.equal(r.auth, "op:pass");
  }
});

test("OPERATOR_RPC with missing url → throws", () => {
  assert.throws(() =>
    resolveTemplateSource(
      {
        templateSource: "OPERATOR_RPC",
        operatorRpcUrl: null,
        operatorRpcAuth: "op:pass",
      },
      PLATFORM,
    ),
  );
});

test("OPERATOR_RPC with missing auth → throws", () => {
  assert.throws(() =>
    resolveTemplateSource(
      {
        templateSource: "OPERATOR_RPC",
        operatorRpcUrl: "http://op-node/",
        operatorRpcAuth: null,
      },
      PLATFORM,
    ),
  );
});

test("templateSourceEndpoint: PLATFORM_DEFAULT returns platform url+auth", () => {
  const e = templateSourceEndpoint({ kind: "PLATFORM_DEFAULT" }, PLATFORM);
  assert.equal(e.url, PLATFORM.url);
  assert.equal(e.auth, PLATFORM.auth);
});

test("templateSourceEndpoint: OPERATOR_RPC returns operator url+auth", () => {
  const e = templateSourceEndpoint(
    { kind: "OPERATOR_RPC", url: "http://op/", auth: "op:p" },
    PLATFORM,
  );
  assert.equal(e.url, "http://op/");
  assert.equal(e.auth, "op:p");
});
