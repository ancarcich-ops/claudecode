"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import PlayerAvatar, { isVariant, type AvatarVariant } from "@/components/Avatar";
import FollowButton from "@/app/u/[username]/FollowButton";
import type { FollowState } from "@/lib/follows";

type Result = {
  id: string;
  username: string;
  displayName: string | null;
  avatarSeed: string | null;
  avatarVariant: string | null;
  avatarUrl: string | null;
  followState: FollowState;
};

// Open people search: type a name, @username, or full email to find
// anyone on Sticks and follow them. Debounced; email matches are exact.
export default function PeopleSearch() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const seq = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 1) {
      setResults([]);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const mine = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(query)}`,
        );
        const data = await res.json();
        // Ignore out-of-order responses.
        if (mine !== seq.current) return;
        setResults(Array.isArray(data.users) ? data.users : []);
        setSearched(true);
      } catch {
        if (mine === seq.current) setResults([]);
      } finally {
        if (mine === seq.current) setLoading(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <section className="card p-4">
      <h2 className="font-display text-base font-semibold text-ink mb-2">
        Find people
      </h2>
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Name, @username, or email"
        autoComplete="off"
        className="w-full rounded-[11px] border border-border bg-panel2 px-3.5 py-3 text-[15px] text-ink placeholder:text-faint focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25"
      />

      <div className="mt-3">
        {loading && (
          <p className="text-sm text-mute px-1 py-2">Searching…</p>
        )}
        {!loading && searched && results.length === 0 && (
          <p className="text-sm text-mute px-1 py-2">
            No one found. Try a full email or exact @username.
          </p>
        )}
        {!loading &&
          results.map((u) => {
            const name = u.displayName ?? u.username;
            const variant: AvatarVariant =
              u.avatarVariant && isVariant(u.avatarVariant)
                ? (u.avatarVariant as AvatarVariant)
                : "beam";
            return (
              <div
                key={u.id}
                className="flex items-center gap-3 py-2 border-b border-border last:border-b-0"
              >
                <Link href={`/u/${u.username}`} className="shrink-0">
                  <span className="inline-block h-9 w-9 rounded-full overflow-hidden">
                    <PlayerAvatar
                      seed={u.avatarSeed ?? u.username}
                      variant={variant}
                      avatarUrl={u.avatarUrl ?? null}
                      size={36}
                    />
                  </span>
                </Link>
                <Link href={`/u/${u.username}`} className="min-w-0 flex-1">
                  <div className="font-medium text-ink truncate">{name}</div>
                  <div className="text-[12px] text-mute truncate">
                    @{u.username}
                  </div>
                </Link>
                <FollowButton
                  targetUserId={u.id}
                  state={u.followState}
                  size="xs"
                />
              </div>
            );
          })}
      </div>
    </section>
  );
}
