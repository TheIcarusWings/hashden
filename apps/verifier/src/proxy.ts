// Transparent Stratum V1 proxy: the miner connects here, we forward to the den
// and observe every job, verifying it pays the configured address before (and
// regardless of) forwarding. MVP is "monitor" — everything is forwarded and each
// job is logged ✓/✗. With --strict we tear the session down on the first failing
// job so the rig stops hashing it.

import net from "node:net";
import {
  parseLine,
  parseSubscribeResult,
  parseMiningNotify,
} from "./stratum.js";
import { parseJobCoinbaseOutputs } from "./coinbase.js";
import { verifyOutputs } from "./verify.js";
import type { VerifierConfig } from "./config.js";

export type Logger = (line: string) => void;

export interface ProxyHandlers {
  /** Called with each verified job result (used by tests). */
  onResult?: (r: { ok: boolean; reason: string; jobId: string }) => void;
}

/** Read newline-delimited lines from `from`, observe each, then forward to `to`. */
function linePump(
  from: net.Socket,
  to: net.Socket,
  onLine: (line: string) => void,
): void {
  let buf = "";
  from.on("data", (chunk: Buffer) => {
    buf += chunk.toString("utf8");
    let nl: number;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      try {
        onLine(line);
      } catch {
        // Never let observation break the mining connection.
      }
      if (!to.destroyed) to.write(line + "\n");
    }
  });
}

export function startProxy(
  cfg: VerifierConfig,
  log: Logger = console.log,
  handlers: ProxyHandlers = {},
): net.Server {
  const server = net.createServer((miner) => {
    const session: { extranonce1?: string; extranonce2Size?: number } = {};
    const den = net.connect(cfg.denPort, cfg.denHost);
    const peer = miner.remoteAddress ?? "?";
    log(`[+] miner connected (${peer}) → ${cfg.denHost}:${cfg.denPort}`);

    // miner → den: forwarded as-is (the MVP doesn't need to inspect submits).
    linePump(miner, den, () => {});

    // den → miner: capture extranonce + verify every job.
    linePump(den, miner, (line) => {
      const msg = parseLine(line);
      if (!msg) return;

      const sub = parseSubscribeResult(msg);
      if (sub) {
        session.extranonce1 = sub.extranonce1;
        session.extranonce2Size = sub.extranonce2Size;
        log(
          `    subscribed: extranonce1=${sub.extranonce1} extranonce2_size=${sub.extranonce2Size}`,
        );
        return;
      }

      const job = parseMiningNotify(msg);
      if (!job) return;
      if (session.extranonce1 == null || session.extranonce2Size == null) {
        log(`    job ${job.jobId}: ⏳ no extranonce yet (awaiting subscribe)`);
        return;
      }
      try {
        const outputs = parseJobCoinbaseOutputs(
          job.coinbase1,
          session.extranonce1,
          session.extranonce2Size,
          job.coinbase2,
        );
        const r = verifyOutputs(outputs, cfg);
        log(`    job ${job.jobId}: ${r.ok ? "✓ OK  " : "✗ FAIL"} — ${r.reason}`);
        handlers.onResult?.({ ok: r.ok, reason: r.reason, jobId: job.jobId });
        if (!r.ok && cfg.strict) {
          log("[!] strict mode: failing job — closing so your rig stops mining it.");
          process.exitCode = 2;
          miner.destroy();
          den.destroy();
          server.close();
        }
      } catch (err) {
        log(`    job ${job.jobId}: ⚠ could not verify: ${(err as Error).message}`);
      }
    });

    const closeBoth = (): void => {
      if (!miner.destroyed) miner.destroy();
      if (!den.destroyed) den.destroy();
    };
    miner.on("close", () => {
      log(`[-] miner disconnected (${peer})`);
      closeBoth();
    });
    den.on("close", closeBoth);
    miner.on("error", (e) => log(`    miner socket error: ${e.message}`));
    den.on("error", (e) => log(`    den socket error: ${e.message}`));
  });

  server.listen(cfg.listenPort, cfg.listenHost, () => {
    log(
      `hashden-verify listening on ${cfg.listenHost}:${cfg.listenPort} → den ${cfg.denHost}:${cfg.denPort}`,
    );
  });
  return server;
}
