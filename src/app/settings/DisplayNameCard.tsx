"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { updateDisplayNameAction } from "@/lib/actions";

// Display-name editor. The name appears on match cards, scoreboards,
// and tournament rosters; leaving it blank falls back to the @handle.
export default function DisplayNameCard({
  username,
  currentDisplayName,
}: {
  username: string;
  currentDisplayName: string | null;
}) {
  const [name, setName] = useState(currentDisplayName ?? "");
  const [pending, startTransition] = useTransition();

  const trimmed = name.trim();
  const original = currentDisplayName ?? "";
  const dirty = trimmed !== original;

  const save = () => {
    const fd = new FormData();
    fd.set("displayName", name);
    startTransition(async () => {
      try {
        await updateDisplayNameAction(fd);
        toast.success(trimmed ? "Display name saved." : "Display name cleared.");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Save failed.";
        toast.error(msg);
      }
    });
  };

  return (
    <div className="card p-5">
      <div className="mb-3">
        <h2 className="font-display text-base font-semibold text-ink">
          Display name
        </h2>
        <p className="text-[11px] text-mute mt-1 max-w-md">
          Shown on match cards and leaderboards. Leave blank to use{" "}
          <span className="font-mono">@{username}</span>.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          id="displayName"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={username}
          className="input flex-1"
          maxLength={40}
        />
        <button
          type="button"
          onClick={save}
          disabled={pending || !dirty}
          className="btn btn-primary shrink-0"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}
