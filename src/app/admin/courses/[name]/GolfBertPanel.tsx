"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  adminGolfBertDescribeAction,
  adminGolfBertPingAction,
  adminGolfBertSearchAction,
  adminImportFromGolfBertAction,
} from "@/lib/actions";

// GolfBert pull-down panel for the admin course editor. Three actions:
//   1. Test credentials (ping the API).
//   2. Search GolfBert by name -> pick a candidate course id.
//   3. Import that course's holes / polygons / hazards into our DB.
//
// All three call server actions so the credentials stay on the server.

type Candidate = {
  id: number;
  name: string;
  city?: string | null;
  state?: string | null;
};

export default function GolfBertPanel({
  courseName,
}: {
  courseName: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Pre-fill the search box with the course name so the most common
  // first action is one click.
  const [query, setQuery] = useState(courseName);
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [manualId, setManualId] = useState("");
  const [lookup, setLookup] = useState<Candidate | null>(null);
  const [pinged, setPinged] = useState<"unknown" | "ok" | "fail">("unknown");

  // Effective id: explicit manual entry wins over a search pick, so the
  // single-course subscriber can paste an id without first searching.
  const effectiveId = (() => {
    const n = Number(manualId.trim());
    if (Number.isFinite(n) && n > 0) return n;
    return pickedId;
  })();

  const ping = () => {
    startTransition(async () => {
      try {
        const r = await adminGolfBertPingAction();
        setPinged("ok");
        toast.success(
          `GolfBert OK${r?.status ? ` (${r.status})` : ""}`,
        );
      } catch (err) {
        setPinged("fail");
        toast.error((err as Error).message);
      }
    });
  };

  const lookupId = (idOverride?: number) => {
    const n = idOverride ?? Number(manualId.trim());
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Enter a numeric GolfBert course id first");
      return;
    }
    startTransition(async () => {
      try {
        const r = await adminGolfBertDescribeAction(n);
        setLookup(r);
        toast.success(
          `Found: ${r.name}${r.city ? ` (${r.city}${r.state ? ", " + r.state : ""})` : ""}`,
        );
        // Echo the id back to the input so the import button picks it up.
        setManualId(String(r.id));
      } catch (err) {
        setLookup(null);
        toast.error((err as Error).message);
      }
    });
  };

  const search = () => {
    if (!query.trim()) return;
    startTransition(async () => {
      try {
        const r = await adminGolfBertSearchAction(query);
        setCandidates(r);
        if (r.length === 0) toast.info("No matches");
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const importCourse = () => {
    if (effectiveId == null) return;
    const fd = new FormData();
    fd.set("courseName", courseName);
    fd.set("golfbertId", String(effectiveId));
    startTransition(async () => {
      try {
        const r = await adminImportFromGolfBertAction(fd);
        toast.success(
          `Imported ${r.holesWritten} holes (par ${r.par}, ${r.hazardsWritten} hazards)`,
        );
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const pingDot =
    pinged === "ok"
      ? "bg-accent"
      : pinged === "fail"
        ? "bg-danger"
        : "bg-mute/40";

  return (
    <div className="border border-border rounded-md bg-panel2/40">
      <details className="group">
        <summary className="px-3 py-2 flex items-center gap-2 cursor-pointer text-sm select-none">
          <span className={"inline-block w-2 h-2 rounded-full " + pingDot} />
          <span className="font-medium">GolfBert</span>
          <span className="text-[11px] text-mute">
            Curated course geometry
          </span>
          <span className="ml-auto text-mute group-open:rotate-90 transition-transform">
            ›
          </span>
        </summary>
        <div className="px-3 pb-3 space-y-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={ping}
              disabled={pending}
              className="btn btn-ghost text-xs h-7"
            >
              Test connection
            </button>
            <span className="text-[11px] text-mute">
              Confirms the three env vars are wired in Vercel.
            </span>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-mute">
              Import by GolfBert course id
            </label>
            <div className="flex gap-1.5">
              <input
                className="input flex-1 text-sm font-mono"
                value={manualId}
                onChange={(e) => {
                  setManualId(e.target.value.replace(/[^0-9]/g, ""));
                  setLookup(null);
                }}
                placeholder="e.g. 4803"
                inputMode="numeric"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    lookupId();
                  }
                }}
              />
              <button
                type="button"
                onClick={() => lookupId()}
                disabled={pending || !manualId.trim()}
                className="btn btn-ghost text-xs h-9"
              >
                Look up
              </button>
            </div>
            {lookup && (
              <div className="border border-border rounded-md px-2.5 py-2 bg-panel/50">
                <div className="text-sm">{lookup.name}</div>
                {(lookup.city || lookup.state) && (
                  <div className="text-[10px] text-mute">
                    {[lookup.city, lookup.state].filter(Boolean).join(", ")}
                  </div>
                )}
                <div className="text-[10px] font-mono text-mute mt-0.5">
                  id {lookup.id}
                </div>
              </div>
            )}
            <p className="text-[10px] text-mute leading-snug">
              Single-course plans: type your licensed id and click{" "}
              <b>Look up</b> to confirm the course name, then{" "}
              <b>Import</b>. Don&rsquo;t know the id? Try{" "}
              <button
                type="button"
                onClick={() => lookupId(4803)}
                disabled={pending}
                className="underline hover:text-fg"
              >
                Chambers Bay (4803)
              </button>{" "}
              &mdash; GolfBert&rsquo;s usual default sample.
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] uppercase tracking-wider text-mute">
              Or search GolfBert by name
            </label>
            <div className="flex gap-1.5">
              <input
                className="input flex-1 text-sm"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. Torrey Pines South"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    search();
                  }
                }}
              />
              <button
                type="button"
                onClick={search}
                disabled={pending || !query.trim()}
                className="btn btn-ghost text-xs h-9"
              >
                Search
              </button>
            </div>
          </div>

          {candidates && (
            <ul className="border border-border rounded-md divide-y divide-border max-h-56 overflow-y-auto">
              {candidates.length === 0 && (
                <li className="px-2.5 py-2 text-[11px] text-mute">
                  No matches
                </li>
              )}
              {candidates.map((c) => {
                const isPicked = pickedId === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setPickedId(c.id)}
                      className={
                        "w-full text-left px-2.5 py-2 flex items-center justify-between gap-2 " +
                        (isPicked ? "bg-accent/10" : "hover:bg-panel/50")
                      }
                    >
                      <div className="min-w-0">
                        <div className="text-sm truncate">{c.name}</div>
                        {(c.city || c.state) && (
                          <div className="text-[10px] text-mute">
                            {[c.city, c.state].filter(Boolean).join(", ")}
                          </div>
                        )}
                      </div>
                      <span className="text-[10px] font-mono text-mute shrink-0">
                        id {c.id}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={importCourse}
              disabled={pending || effectiveId == null}
              className="btn btn-primary text-xs h-8"
            >
              Import {effectiveId != null ? `id ${effectiveId}` : "selected course"}
            </button>
            <span className="text-[11px] text-mute">
              Writes greens, tees, hazards, and pars into{" "}
              <span className="font-mono">{courseName}</span>.
            </span>
          </div>
        </div>
      </details>
    </div>
  );
}
