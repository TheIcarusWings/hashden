// Public status page. Server-side probes every public endpoint on each
// request; renders in hashden's design language. Auto-refreshes every
// 60s via meta tag. Internal Kuma stays private — this page is the
// reader-friendly answer to "is hashden up?".

import Link from "next/link";
import net from "node:net";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Probe {
  name: string;
  kind: "http" | "tcp";
  target: string;
  tier: "prod" | "dev" | "infra";
  result: { up: boolean; latencyMs: number; detail: string };
}

const HTTP_TARGETS: { name: string; url: string; tier: Probe["tier"] }[] = [
  { name: "Web", url: "https://hashden.app", tier: "prod" },
  { name: "API", url: "https://api.hashden.app/hashden/groups", tier: "prod" },
  { name: "Web (dev)", url: "https://dev.hashden.app", tier: "dev" },
  { name: "API (dev)", url: "https://dev-api.hashden.app/hashden/groups", tier: "dev" },
];

const TCP_TARGETS: { name: string; host: string; port: number; tier: Probe["tier"] }[] = [
  { name: "Stratum", host: "stratum.hashden.app", port: 3333, tier: "prod" },
  { name: "Stratum (dev)", host: "dev-stratum.hashden.app", port: 3343, tier: "dev" },
];

async function probeHttp(url: string): Promise<Probe["result"]> {
  const start = Date.now();
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      cache: "no-store",
      redirect: "manual",
    });
    clearTimeout(t);
    const latencyMs = Date.now() - start;
    const ok = res.status >= 200 && res.status < 400;
    return { up: ok, latencyMs, detail: `HTTP ${res.status}` };
  } catch (e) {
    return {
      up: false,
      latencyMs: Date.now() - start,
      detail: (e as Error).name === "AbortError" ? "timeout" : (e as Error).message,
    };
  }
}

function probeTcp(host: string, port: number): Promise<Probe["result"]> {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = new net.Socket();
    const done = (up: boolean, detail: string) => {
      sock.destroy();
      resolve({ up, latencyMs: Date.now() - start, detail });
    };
    sock.setTimeout(5000);
    sock.on("connect", () => done(true, "connected"));
    sock.on("timeout", () => done(false, "timeout"));
    sock.on("error", (e) => done(false, e.message));
    sock.connect(port, host);
  });
}

async function runProbes(): Promise<Probe[]> {
  const httpProbes: Promise<Probe>[] = HTTP_TARGETS.map(async (t) => ({
    name: t.name,
    kind: "http" as const,
    target: t.url,
    tier: t.tier,
    result: await probeHttp(t.url),
  }));
  const tcpProbes: Promise<Probe>[] = TCP_TARGETS.map(async (t) => ({
    name: t.name,
    kind: "tcp" as const,
    target: `${t.host}:${t.port}`,
    tier: t.tier,
    result: await probeTcp(t.host, t.port),
  }));
  return Promise.all([...httpProbes, ...tcpProbes]);
}

export const metadata = {
  title: "Hashden — status",
  description: "Live health of the Hashden platform.",
};

export default async function StatusPage() {
  const probes = await runProbes();
  const prodProbes = probes.filter((p) => p.tier === "prod");
  const devProbes = probes.filter((p) => p.tier === "dev");
  const allProdUp = prodProbes.every((p) => p.result.up);
  const someDown = probes.some((p) => !p.result.up);
  const checkedAt = new Date().toUTCString();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      {/* Auto-refresh every 60s without JS — matches our SSR-only stack. */}
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <meta httpEquiv="refresh" content="60" />

      <Link
        href={"/" as any}
        className="text-xs text-ink-mute hover:text-ink-dim transition-colors"
      >
        ← back to marketplace
      </Link>

      <header className="mt-3 mb-12">
        <h1 className="text-4xl font-semibold tracking-tight">Status</h1>
        <p className="mt-2 text-sm text-ink-dim">
          Live health of the Hashden platform. Probes refresh every 60 seconds
          on page load.
        </p>
      </header>

      <section
        className={`mb-10 rounded-lg border p-5 ${
          allProdUp
            ? "border-accent/40 bg-accent/5"
            : "border-line bg-bg-subtle"
        }`}
      >
        <div className="flex items-center gap-3">
          <Dot up={allProdUp} />
          <div className="text-lg font-medium text-ink">
            {allProdUp
              ? "All production systems operational"
              : "Production degraded — see below"}
          </div>
        </div>
        {someDown && !allProdUp && (
          <p className="mt-2 text-sm text-ink-dim">
            Something's not responding. We're probably already on it (alerts
            fire to the operator's phone via Telegram). If you've been waiting
            more than a few minutes,{" "}
            <a
              href="https://primal.net/p/npub13uw3c3k6ahe5wkx9c3jxaslmzp8apwde75raw6nfch8nmeaferxqv3d5ry"
              className="text-accent hover:underline font-mono"
            >
              DM the project npub
            </a>
            .
          </p>
        )}
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-ink-mute mb-4">
          Production
        </h2>
        <ul className="space-y-2">
          {prodProbes.map((p) => (
            <ProbeRow key={p.name + p.target} p={p} />
          ))}
        </ul>
      </section>

      <section className="mb-10">
        <h2 className="text-xs uppercase tracking-wider text-ink-mute mb-4">
          Development
        </h2>
        <ul className="space-y-2">
          {devProbes.map((p) => (
            <ProbeRow key={p.name + p.target} p={p} />
          ))}
        </ul>
      </section>

      <footer className="mt-12 pt-6 border-t border-line text-xs text-ink-mute space-y-1">
        <p>Last checked: {checkedAt}</p>
        <p>
          This page does its own probes server-side on each request. Internal
          monitoring + alerting (Uptime Kuma + Telegram) runs separately on
          a private dashboard — this page is the public reader-friendly view.
        </p>
      </footer>
    </main>
  );
}

function ProbeRow({ p }: { p: Probe }) {
  return (
    <li className="rounded-lg border border-line bg-bg-subtle p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Dot up={p.result.up} />
          <div className="min-w-0">
            <div className="text-sm font-medium text-ink">{p.name}</div>
            <div className="text-xs text-ink-mute font-mono truncate">
              {p.target}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-ink-dim font-mono">
            {p.result.up ? `${p.result.latencyMs} ms` : p.result.detail}
          </div>
          <div className="text-[10px] uppercase tracking-wider text-ink-mute mt-0.5">
            {p.kind}
          </div>
        </div>
      </div>
    </li>
  );
}

function Dot({ up }: { up: boolean }) {
  return (
    <span
      className={`shrink-0 inline-block h-2.5 w-2.5 rounded-full ${
        up ? "bg-accent" : "bg-ink-mute"
      }`}
      aria-label={up ? "up" : "down"}
    />
  );
}
