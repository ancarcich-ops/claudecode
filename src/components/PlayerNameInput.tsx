"use client";

import { useEffect, useRef, useState } from "react";

type Suggestion = {
  id: string;
  username: string;
  displayName: string | null;
  // Auto-computed Sticks index. `null` means the user hasn't logged
  // 3+ rounds yet -- callers should treat this as "pending" and not
  // fake a default handicap.
  handicapIndex: number | null;
};

export type PlayerPick = {
  name: string;
  userId: string | null;
  // Only set when the user picked a linked Sticks account. `index`
  // is the auto-computed Sticks index, or null if pending.
  handicapIndex?: number | null;
};

export default function PlayerNameInput({
  value,
  userId,
  onChange,
  placeholder,
}: {
  value: string;
  userId: string | null;
  onChange: (next: PlayerPick) => void;
  placeholder: string;
}) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Close the dropdown when the user clicks anywhere else.
  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, []);

  const fetchSuggestions = (q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/users/suggest?q=${encodeURIComponent(q)}`,
        );
        if (!res.ok) return;
        const data: { users: Suggestion[] } = await res.json();
        setSuggestions(data.users ?? []);
        setActiveIdx(0);
      } catch {
        // Network errors fail silently; the user can still type a name.
      }
    }, 150);
  };

  const pick = (s: Suggestion) => {
    onChange({
      name: s.displayName ?? s.username,
      userId: s.id,
      handicapIndex: s.handicapIndex,
    });
    setOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      const s = suggestions[activeIdx];
      if (s) {
        e.preventDefault();
        pick(s);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapperRef} className="relative flex-1 min-w-0">
      <input
        type="text"
        name="playerName"
        value={value}
        onChange={(e) => {
          // Any edit clears the link -- the typed name no longer matches
          // the resolved user. Re-pick from the dropdown to relink.
          onChange({ name: e.target.value, userId: null });
          fetchSuggestions(e.target.value);
          setOpen(true);
        }}
        onFocus={() => {
          if (value) fetchSuggestions(value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={"input w-full" + (userId ? " pr-14" : "")}
        autoComplete="off"
        maxLength={32}
        required
      />
      <input type="hidden" name="playerUserId" value={userId ?? ""} />
      {userId && (
        <span
          className="chip text-[10px] py-0 absolute right-1.5 top-1/2 -translate-y-1/2 text-accent border-accent/30 bg-accent/10"
          title="Linked to a user account"
        >
          linked
        </span>
      )}
      {open && suggestions.length > 0 && (
        <ul
          className="absolute left-0 right-0 mt-1 z-20 rounded-md border border-border bg-panel max-h-56 overflow-y-auto shadow-lg"
          role="listbox"
        >
          {suggestions.map((s, i) => {
            const active = i === activeIdx;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    // mousedown beats input blur so the pick actually applies
                    e.preventDefault();
                    pick(s);
                  }}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={
                    "block w-full text-left px-3 py-2 text-sm " +
                    (active ? "bg-panel2 text-ink" : "text-ink hover:bg-panel2")
                  }
                  role="option"
                  aria-selected={active}
                >
                  <span className="font-medium">
                    {s.displayName ?? s.username}
                  </span>
                  <span className="text-mute text-xs ml-1.5">
                    @{s.username}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
