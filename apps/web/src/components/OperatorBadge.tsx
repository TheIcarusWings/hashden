import { fetchOperatorProfile } from "@/lib/nostr/operator-profile";
import { shortNpub } from "@/lib/nostr/format";

/**
 * Renders an operator's Nostr identity: kind-0 name + picture + nip05
 * if available, otherwise truncated pubkey. Server component — fetches
 * and caches the profile in-process for 5 minutes.
 */
export async function OperatorBadge({ pubkey }: { pubkey: string }) {
  const profile = await fetchOperatorProfile(pubkey).catch(() => null);
  const display = profile?.displayName || profile?.name;
  const initials = (display ?? pubkey).slice(0, 2).toUpperCase();

  return (
    <a
      href={`https://njump.me/${pubkey}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-3 rounded-md border border-line bg-bg-panel px-3 py-2 text-xs hover:border-ink-mute transition-colors"
    >
      <div className="size-8 rounded-full bg-bg-subtle border border-line flex items-center justify-center overflow-hidden text-[10px] font-mono">
        {profile?.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={profile.picture}
            alt={display ?? "operator"}
            className="size-full object-cover"
          />
        ) : (
          <span className="text-ink-mute">{initials}</span>
        )}
      </div>
      <div className="flex flex-col">
        <span className="text-ink">{display ?? "operator"}</span>
        <span className="font-mono text-ink-mute">
          {profile?.nip05 ?? shortNpub(pubkey)}
        </span>
      </div>
    </a>
  );
}
