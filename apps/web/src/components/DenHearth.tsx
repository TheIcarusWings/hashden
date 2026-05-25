/*
  Living hearth background for the Warm Lair theme — a dim, always-on fire:
  a flickering glow at the base, rising embers, tumbling light shards, and
  occasional flares. CSS-only (transform/opacity) so it's GPU-cheap; styles
  live in globals.css, gated to [data-theme="warm-lair"] and disabled under
  prefers-reduced-motion. Static deterministic markup, so it renders on the
  server with no hydration mismatch. Inspired by the zerokeys lock-screen embers.
*/

const EMBERS = Array.from({ length: 26 });
const SHARDS = Array.from({ length: 12 });

export function DenHearth() {
  return (
    <div className="den-hearth" aria-hidden="true">
      <div className="den-hearth-glow" />
      <div className="den-hearth-flare den-hearth-flare-1" />
      <div className="den-hearth-flare den-hearth-flare-2" />

      {EMBERS.map((_, i) => (
        <span
          key={`e${i}`}
          className={`den-ember${i % 2 ? " den-ember-alt" : ""}`}
          style={{
            left: `${(i * 3.9 + (i % 5) * 2) % 100}%`,
            width: `${2 + (i % 3)}px`,
            height: `${2 + (i % 3)}px`,
            animationDelay: `${(i * 1.7) % 14}s`,
            animationDuration: `${11 + ((i * 2.3) % 12)}s`,
          }}
        />
      ))}

      {SHARDS.map((_, i) => (
        <span
          key={`s${i}`}
          className={`den-shard${i % 2 ? " den-shard-alt" : ""}`}
          style={{
            left: `${(i * 8.3 + 4) % 100}%`,
            animationDelay: `${(i * 2.9) % 16}s`,
            animationDuration: `${14 + ((i * 3.1) % 14)}s`,
          }}
        />
      ))}
    </div>
  );
}
