import { NextResponse } from "next/server";
import {
  BUILD_IMAGE,
  BUILD_REF,
  BUILD_REPO,
  BUILD_SHA,
  BUILD_TIME,
} from "@/lib/env";

// Machine-readable build provenance for the running web bundle. Lets anyone
// (a script, a verifier extension, a curious miner) read which commit this
// deployment was built from, then match it against the public repo and the
// signed GHCR image. See /verify for the human version + the verify commands.
//
// This is a *self-reported* claim — it proves nothing on its own. Its value is
// that it commits the operator publicly to a specific commit; the actual proof
// happens off-box via `cosign verify` / `gh attestation verify`.
export const dynamic = "force-dynamic";

export function GET() {
  const known = BUILD_SHA !== "unknown";
  return NextResponse.json({
    commit: BUILD_SHA,
    ref: BUILD_REF,
    builtAt: BUILD_TIME,
    repo: BUILD_REPO,
    image: BUILD_IMAGE,
    imageTag: known ? `sha-${BUILD_SHA}` : null,
    source: known
      ? `https://github.com/${BUILD_REPO}/commit/${BUILD_SHA}`
      : null,
    verify: "/verify",
  });
}
