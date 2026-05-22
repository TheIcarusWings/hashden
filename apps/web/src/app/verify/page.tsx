import Link from "next/link";
import { CommandBlock } from "@/components/CommandBlock";
import {
  BUILD_IMAGE,
  BUILD_REF,
  BUILD_REPO,
  BUILD_SHA,
  BUILD_TIME,
  BUILD_WORKFLOW,
} from "@/lib/env";

export const metadata = {
  title: "Verify this build — Hashden",
  description:
    "Hashden is open source. Check, yourself, that the code running here is the exact code in the public repo — built, signed and attested by CI.",
};

// Read at request time so the page always reflects the live container's baked
// provenance, not a value frozen at build.
export const dynamic = "force-dynamic";

export default function VerifyPage() {
  const known = BUILD_SHA !== "unknown";
  const shortSha = known ? BUILD_SHA.slice(0, 12) : null;
  const imageTag = known ? `${BUILD_IMAGE}:sha-${BUILD_SHA}` : null;
  const commitUrl = known
    ? `https://github.com/${BUILD_REPO}/commit/${BUILD_SHA}`
    : null;
  const repoUrl = `https://github.com/${BUILD_REPO}`;
  const packageUrl = `https://github.com/${BUILD_REPO}/pkgs/container/hashden-web`;

  const ref = known ? imageTag! : `${BUILD_IMAGE}:sha-<commit>`;

  const ghCommand = `gh attestation verify oci://${ref} --repo ${BUILD_REPO}`;
  const cosignCommand = [
    `cosign verify ${ref} \\`,
    `  --certificate-identity-regexp '^https://github.com/${BUILD_REPO}/${BUILD_WORKFLOW}@refs/heads/dev' \\`,
    `  --certificate-oidc-issuer https://token.actions.githubusercontent.com`,
  ].join("\n");

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <Link
        href={"/" as any}
        className="text-xs text-ink-mute hover:text-ink-dim transition-colors"
      >
        ← back home
      </Link>

      <header className="mt-4 mb-8">
        <div className="text-xs uppercase tracking-[0.2em] text-ink-mute mb-3">
          trust, but verify
        </div>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.05]">
          Verify this <span className="text-accent">build</span>.
        </h1>
        <p className="mt-5 text-base text-ink-dim leading-relaxed">
          Hashden is open source. You shouldn&apos;t have to take our word that{" "}
          <span className="text-ink">hashden.app</span> runs that code — you can
          check it. This deployment reports the exact commit it was built from,
          and our CI signs every image so anyone can confirm it came from the{" "}
          <a
            href={repoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            public repo
          </a>
          . The check below runs on <span className="text-ink">your</span>{" "}
          machine, against public logs — not on ours.
        </p>
      </header>

      <section aria-labelledby="running" className="mb-10">
        <h2
          id="running"
          className="text-xs uppercase tracking-[0.2em] text-ink-mute mb-3"
        >
          What&apos;s running now
        </h2>

        {known ? (
          <dl className="rounded-lg border border-line bg-bg-subtle divide-y divide-line text-sm">
            <div className="flex items-start justify-between gap-4 p-4">
              <dt className="text-ink-mute">Commit</dt>
              <dd className="text-right">
                <a
                  href={commitUrl!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:underline break-all"
                >
                  {shortSha}
                </a>
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 p-4">
              <dt className="text-ink-mute">Branch</dt>
              <dd className="text-ink-dim text-right">{BUILD_REF}</dd>
            </div>
            <div className="flex items-start justify-between gap-4 p-4">
              <dt className="text-ink-mute">Built at</dt>
              <dd className="text-ink-dim text-right break-all">
                {BUILD_TIME}
              </dd>
            </div>
            <div className="flex items-start justify-between gap-4 p-4">
              <dt className="text-ink-mute">Image</dt>
              <dd className="text-right">
                <a
                  href={packageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink-dim hover:text-ink break-all"
                >
                  {imageTag}
                </a>
              </dd>
            </div>
          </dl>
        ) : (
          <div className="rounded-lg border border-line bg-bg-subtle p-6 text-sm text-ink-dim leading-relaxed">
            This deployment wasn&apos;t built by the verifiable pipeline, so it
            can&apos;t report a commit. The signed-image build is being rolled
            out — for now you can still inspect the source and the published,
            signed images directly on{" "}
            <a
              href={repoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              GitHub
            </a>
            . The commands below show the shape of the check.
          </div>
        )}

        <p className="mt-3 text-xs text-ink-mute">
          Machine-readable at{" "}
          <a href="/api/version" className="hover:text-ink-dim underline">
            /api/version
          </a>
          .
        </p>
      </section>

      <section aria-labelledby="howto" className="mb-10">
        <h2
          id="howto"
          className="text-xs uppercase tracking-[0.2em] text-ink-mute mb-3"
        >
          Verify it yourself
        </h2>
        <p className="text-sm text-ink-dim leading-relaxed mb-5">
          Pick either tool. Both confirm the image{" "}
          {known ? "above" : "for a given commit"} was built by our CI from the
          public repo — not hand-rolled or tampered with.
        </p>

        <div className="space-y-6">
          <div>
            <h3 className="text-sm text-ink mb-2">
              1 · GitHub attestation{" "}
              <span className="text-ink-mute">— simplest</span>
            </h3>
            <p className="text-xs text-ink-mute leading-relaxed mb-2">
              Needs the{" "}
              <a
                href="https://cli.github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-ink-dim underline"
              >
                GitHub CLI
              </a>
              . Confirms a signed SLSA provenance attestation links this image to
              a build of {BUILD_REPO}.
            </p>
            <CommandBlock command={ghCommand} />
          </div>

          <div>
            <h3 className="text-sm text-ink mb-2">
              2 · cosign{" "}
              <span className="text-ink-mute">— public transparency log</span>
            </h3>
            <p className="text-xs text-ink-mute leading-relaxed mb-2">
              Needs{" "}
              <a
                href="https://docs.sigstore.dev/cosign/system_config/installation/"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-ink-dim underline"
              >
                cosign
              </a>
              . Verifies the keyless signature recorded in the public Rekor log,
              tied to our release workflow&apos;s identity.
            </p>
            <CommandBlock command={cosignCommand} />
          </div>
        </div>
      </section>

      <section aria-labelledby="limits">
        <h2
          id="limits"
          className="text-xs uppercase tracking-[0.2em] text-ink-mute mb-3"
        >
          What this proves — and what it doesn&apos;t
        </h2>
        <div className="rounded-lg border border-line bg-bg-subtle p-6 text-sm text-ink-dim leading-relaxed space-y-3">
          <p>
            <span className="text-good">✓ Proves:</span> the published image is
            authentically built from the commit shown above, by our CI, from the
            public repo. Tampering or a hand-built image fails the check.
          </p>
          <p>
            <span className="text-ink">⚠ Doesn&apos;t prove on its own:</span>{" "}
            that the live server is running <em>only</em> that image. A server
            can claim one commit and run another — that gap closes with the
            coming verifier extension (checks the code your browser actually
            receives) and, ultimately, with hardware attestation.
          </p>
          <p className="text-ink-mute">
            The strongest guarantee is structural, not a badge: Hashden is{" "}
            <Link
              href={"/docs" as any}
              className="text-accent hover:underline"
            >
              non-custodial
            </Link>
            , so your payout is set by the coinbase your own miner hashes — which
            you can check on your own hardware, no trust in this site required.
          </p>
        </div>
      </section>
    </main>
  );
}
