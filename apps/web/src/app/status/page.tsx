// Public status page. Minimal disclosure: only the three user-facing
// prod services. Probes run server-side per request; auto-refreshes
// every 60s via meta tag. Internal monitoring (dev, Bitcoin RPC, NAS)
// stays on the private Kuma dashboard.

import Link from "next/link";
import net from "node:net";

export const dynamic = "force-dynamic";
export const revalidate = 0;

interface Probe {
  name: string;
  result: { up: boolean; latencyMs: number };
}

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
    return {
      up: res.status >= 200 && res.status < 400,
      latencyMs: Date.now() - start,
    };
  } catch {
    return { up: false, latencyMs: Date.now() - start };
  }
}

function probeTcp(host: string, port: number): Promise<Probe["result"]> {
  return new Promise((resolve) => {
    const start = Date.now();
    const sock = new net.Socket();
    const done = (up: boolean) => {
      sock.destroy();
      resolve({ up, latencyMs: Date.now() - start });
    };
    sock.setTimeout(5000);
    sock.on("connect", () => done(true));
    sock.on("timeout", () => done(false));
    sock.on("error", () => done(false));
    sock.connect(port, host);
  });
}

async function runProbes(): Promise<Probe[]> {
  const [web, api, stratum] = await Promise.all([
    probeHttp("https://hashden.app"),
    probeHttp("https://api.hashden.app/hashden/groups"),
    probeTcp("stratum.hashden.app", 3333),
  ]);
  return [
    { name: "Web", result: web },
    { name: "API", result: api },
    { name: "Stratum", result: stratum },
  ];
}

export const metadata = {
  title: "Hashden status",
  description: "Is Hashden up right now?",
};

export default async function StatusPage() {
  const probes = await runProbes();
  const allUp = probes.every((p) => p.result.up);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      {/* eslint-disable-next-line @next/next/no-head-element */}
      <meta httpEquiv="refresh" content="60" />

      <Link
        href={"/" as any}
        className="text-xs text-ink-mute hover:text-ink-dim transition-colors"
      >
        ← back home
      </Link>

      <header className="mt-3 mb-10">
        <h1 className="text-4xl font-semibold tracking-tight">Status</h1>
      </header>

      <section
        className={`mb-8 rounded-lg border p-5 ${
          allUp ? "border-good/40 bg-good/5" : "border-line bg-bg-subtle"
        }`}
      >
        <div className="flex items-center gap-3">
          <Dot up={allUp} />
          <div className="text-lg font-medium text-ink">
            {allUp
              ? "Everything looks good"
              : "Something is not responding"}
          </div>
        </div>
        {!allUp && (
          <p className="mt-2 text-sm text-ink-dim">
            The operator gets a phone alert within a minute or two. If it's
            been longer than that,{" "}
            <a
              href="https://primal.net/p/npub19tzp8lf3klmqj3dz9mz0qnuvjp7uyy9993gmljmyaxs8phztj7wsnujvq5"
              className="text-accent hover:underline"
            >
              DM @icaruswings on Nostr
            </a>
            .
          </p>
        )}
      </section>

      <ul className="space-y-2">
        {probes.map((p) => (
          <li
            key={p.name}
            className="rounded-lg border border-line bg-bg-subtle p-4 flex items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <Dot up={p.result.up} />
              <span className="text-sm font-medium text-ink">{p.name}</span>
            </div>
            <span className="text-xs text-ink-dim font-mono">
              {p.result.up ? `${p.result.latencyMs} ms` : "unreachable"}
            </span>
          </li>
        ))}
      </ul>

      <footer className="mt-10 pt-6 border-t border-line text-xs text-ink-mute">
        <p>
          Checks rerun every 60 seconds. Internal monitoring and alerting
          run separately.
        </p>
      </footer>
    </main>
  );
}

function Dot({ up }: { up: boolean }) {
  return (
    <span
      className={`shrink-0 inline-block h-2.5 w-2.5 rounded-full ${
        up ? "bg-good" : "bg-ink-mute"
      }`}
      aria-label={up ? "up" : "down"}
    />
  );
}
