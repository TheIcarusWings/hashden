// Minimal Stratum V1 message parsing — only what the verifier needs to observe:
// the subscribe response (for extranonce1 / extranonce2_size) and every
// mining.notify job. Messages are matched by shape, so we don't have to track
// JSON-RPC request ids.

export interface MiningJob {
  jobId: string;
  prevHash: string;
  coinbase1: string;
  coinbase2: string;
  merkleBranches: string[];
  version: string;
  nbits: string;
  ntime: string;
  cleanJobs: boolean;
}

export interface SubscribeInfo {
  extranonce1: string;
  extranonce2Size: number;
}

/** Parse one newline-delimited JSON-RPC line; null on blank/invalid. */
export function parseLine(line: string): unknown | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}

/**
 * mining.subscribe response:
 *   { id, result: [ [["mining.notify", id]], extranonce1, extranonce2_size ], error }
 */
export function parseSubscribeResult(msg: unknown): SubscribeInfo | null {
  const result = (msg as { result?: unknown })?.result;
  if (!Array.isArray(result) || result.length < 3) return null;
  const extranonce1 = result[1];
  const extranonce2Size = result[2];
  if (typeof extranonce1 !== "string" || typeof extranonce2Size !== "number") {
    return null;
  }
  if (!/^[0-9a-fA-F]+$/.test(extranonce1)) return null;
  if (extranonce2Size < 1 || extranonce2Size > 64) return null;
  return { extranonce1, extranonce2Size };
}

/**
 * mining.notify:
 *   { method: "mining.notify",
 *     params: [jobId, prevHash, cb1, cb2, merkleBranches, version, nbits, ntime, cleanJobs] }
 */
export function parseMiningNotify(msg: unknown): MiningJob | null {
  const m = msg as { method?: unknown; params?: unknown };
  if (m?.method !== "mining.notify") return null;
  const p = m.params;
  if (!Array.isArray(p) || p.length < 9) return null;
  const [
    jobId,
    prevHash,
    coinbase1,
    coinbase2,
    merkleBranches,
    version,
    nbits,
    ntime,
    cleanJobs,
  ] = p;
  if (typeof coinbase1 !== "string" || typeof coinbase2 !== "string") return null;
  if (!Array.isArray(merkleBranches)) return null;
  return {
    jobId: String(jobId),
    prevHash: String(prevHash),
    coinbase1,
    coinbase2,
    merkleBranches: merkleBranches.map(String),
    version: String(version),
    nbits: String(nbits),
    ntime: String(ntime),
    cleanJobs: Boolean(cleanJobs),
  };
}
