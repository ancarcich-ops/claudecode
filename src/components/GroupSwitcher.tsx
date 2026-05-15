"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectGroupAction, signOutAction } from "@/lib/actions";

export type GroupOption = { id: string; name: string };

export default function GroupSwitcher({
  groups,
  active,
  username,
}: {
  groups: GroupOption[];
  active: string;
  username: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  const pick = (value: string) => {
    const fd = new FormData();
    fd.set("groupId", value);
    startTransition(async () => {
      await selectGroupAction(fd);
      router.refresh();
    });
    setOpen(false);
  };

  const activeLabel =
    active === "public"
      ? "Public only"
      : active
        ? (groups.find((g) => g.id === active)?.name ?? "All my groups")
        : "All my groups";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        className="btn btn-ghost h-9 px-2.5 text-xs whitespace-nowrap max-w-[10rem] sm:max-w-[14rem]"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="truncate">{activeLabel}</span>
        <span aria-hidden className="opacity-60">▾</span>
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-30 min-w-[14rem] rounded-md border border-border bg-panel shadow-lg overflow-hidden"
          role="menu"
        >
          <div className="text-[10px] uppercase tracking-wider text-mute px-3 pt-2 pb-1">
            View
          </div>
          <MenuItem
            label="All my groups"
            active={!active}
            onClick={() => pick("")}
          />
          <MenuItem
            label="Public only"
            active={active === "public"}
            onClick={() => pick("public")}
          />
          {groups.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-wider text-mute px-3 pt-2 pb-1">
                My groups
              </div>
              {groups.map((g) => (
                <MenuItem
                  key={g.id}
                  label={g.name}
                  active={active === g.id}
                  onClick={() => pick(g.id)}
                />
              ))}
            </>
          )}
          <div className="border-t border-border mt-1" />
          <div className="px-3 pt-2 pb-1 text-[11px] text-mute truncate">
            Signed in as <span className="text-ink">@{username}</span>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              className="block w-full text-left px-3 py-2 text-sm text-danger hover:bg-danger/10"
              role="menuitem"
            >
              Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function MenuItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex w-full items-center justify-between px-3 py-2 text-sm " +
        (active ? "text-accent bg-accent/5" : "text-ink hover:bg-panel2")
      }
      role="menuitem"
    >
      <span className="truncate">{label}</span>
      {active && <span aria-hidden>✓</span>}
    </button>
  );
}
