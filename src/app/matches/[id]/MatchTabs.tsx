"use client";

import { useEffect, useState } from "react";

export type MatchTab = {
  id: string;
  label: string;
  // Optional dot / count callout next to the label
  badge?: string | number | null;
  content: React.ReactNode;
  // If true, this tab is shown but disabled (greyed). Useful while we
  // gate creator-only views without re-rendering the whole tree.
  disabled?: boolean;
};

// Tabbed view for the match detail page. Replaces the long stack of
// inline cards with one card per tab, plus a horizontal strip of tabs
// at the top. Active tab is mirrored to ?tab=<id> in the URL so a
// reload (or share) lands you back where you were.
//
// Implementation note: each tab's content is rendered eagerly but
// hidden via display:none on inactive tabs. We need eager rendering
// because most of the children are server components that wouldn't
// re-render on tab switch -- by mounting them all up front, tab
// switches are instant and form state isn't blown away.
export default function MatchTabs({
  tabs,
  defaultTabId,
}: {
  tabs: MatchTab[];
  defaultTabId?: string;
}) {
  const [active, setActive] = useState<string>(
    defaultTabId ?? tabs[0]?.id ?? "",
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t && tabs.some((x) => x.id === t && !x.disabled)) {
      setActive(t);
    }
  }, [tabs]);

  const setTab = (id: string) => {
    setActive(id);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("tab", id);
    window.history.replaceState(null, "", url.toString());
  };

  return (
    <div className="space-y-3">
      <div
        role="tablist"
        aria-label="Match sections"
        className="flex gap-1 overflow-x-auto border-b border-border -mx-3 sm:mx-0 px-3 sm:px-0 sticky top-14 z-20 bg-bg/90 backdrop-blur"
      >
        {tabs.map((t) => {
          const isActive = active === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`panel-${t.id}`}
              id={`tab-${t.id}`}
              disabled={t.disabled}
              onClick={() => !t.disabled && setTab(t.id)}
              className={
                "relative px-3 py-2.5 text-sm whitespace-nowrap transition-colors -mb-px border-b-2 " +
                (t.disabled
                  ? "border-transparent text-faint cursor-not-allowed"
                  : isActive
                    ? "border-accent text-accent font-medium"
                    : "border-transparent text-mute hover:text-ink")
              }
            >
              {t.label}
              {t.badge != null && t.badge !== "" && (
                <span
                  className={
                    "ml-1.5 inline-flex items-center justify-center rounded-full text-[10px] font-mono tabular-nums px-1.5 min-w-[1.25rem] " +
                    (isActive
                      ? "bg-accent/15 text-accent"
                      : "bg-panel2 text-mute")
                  }
                >
                  {t.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          id={`panel-${t.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${t.id}`}
          hidden={active !== t.id}
        >
          {t.content}
        </div>
      ))}
    </div>
  );
}
