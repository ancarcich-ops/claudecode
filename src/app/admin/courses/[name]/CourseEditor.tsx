"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  adminClearHoleGeoAction,
  adminRenameCourseAction,
  adminSaveHoleGeoAction,
  adminSetCourseCenterAction,
  deleteHazardAction,
  markHazardAction,
} from "@/lib/actions";
import GolfBertPanel from "./GolfBertPanel";

// Admin course-geometry editor. Shows a Mapbox satellite image of the
// course (center + ~1.5km bbox), a 18-hole sidebar, and a "set tee"
// / "set green" affordance per hole. After picking which pin to place,
// the next map click writes that lat/lng to the DB.
//
// Pan: arrow buttons (or drag). Zoom: +/- buttons. The state is held
// client-side; saves happen via server action.

type TeeAlternative = {
  color: string;
  teeboxtype: string | null;
  lat: number;
  lng: number;
  yds: number | null;
};

type HoleRow = {
  hole: number;
  teeLat: number | null;
  teeLng: number | null;
  greenLat: number | null;
  greenLng: number | null;
  teeAlternatives: TeeAlternative[];
};

type Hazard = {
  id: string;
  hole: number;
  // String not enum-typed -- schema stores it as a free string and the
  // server action normalises to WATER/SAND/OOB/OTHER on write.
  kind: string;
  lat: number;
  lng: number;
};

// Hazard placement keeps the same "pick + click" pattern as tee/green
// pins, just with extra kinds. After placing a hazard the target
// stays the same so you can drop a string of bunkers without round-
// tripping back to the sidebar.
type Pending =
  | { hole: number; kind: "tee" | "green" | "water" | "sand" }
  | null;

function mercY(latDeg: number): number {
  const lat = (latDeg * Math.PI) / 180;
  return Math.log(Math.tan(Math.PI / 4 + lat / 2));
}
function inverseMercY(my: number): number {
  const latRad = 2 * (Math.atan(Math.exp(my)) - Math.PI / 4);
  return (latRad * 180) / Math.PI;
}

export default function CourseEditor({
  courseName,
  city,
  centerLat,
  centerLng,
  holes: initialHoles,
  hazards: initialHazards,
}: {
  courseName: string;
  city: string | null;
  centerLat: number | null;
  centerLng: number | null;
  holes: HoleRow[];
  hazards: Hazard[];
}) {
  const router = useRouter();
  const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const [pending, startTransition] = useTransition();
  const [holes, setHoles] = useState<HoleRow[]>(initialHoles);
  const [hazards, setHazards] = useState<Hazard[]>(initialHazards);
  const [target, setTarget] = useState<Pending>(null);

  // If the course has any existing geometry, default the map center
  // to its centroid; otherwise use the saved center; otherwise leave
  // null and ask the user to provide one.
  const initialCentroid = useMemo(() => {
    const pts: { lat: number; lng: number }[] = [];
    for (const h of initialHoles) {
      if (h.teeLat != null && h.teeLng != null)
        pts.push({ lat: h.teeLat, lng: h.teeLng });
      if (h.greenLat != null && h.greenLng != null)
        pts.push({ lat: h.greenLat, lng: h.greenLng });
    }
    if (pts.length === 0) return null;
    const lat =
      pts.reduce((acc, p) => acc + p.lat, 0) / pts.length;
    const lng =
      pts.reduce((acc, p) => acc + p.lng, 0) / pts.length;
    return { lat, lng };
  }, [initialHoles]);

  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(
    initialCentroid ??
      (centerLat != null && centerLng != null
        ? { lat: centerLat, lng: centerLng }
        : null),
  );
  // Half-width / half-height of the bbox in meters. ~750m default
  // shows a typical 18-hole course in one view.
  const [halfM, setHalfM] = useState(750);

  // Container size for aspect-aware Mapbox image + viewBox.
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 600 });
  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;
    const obs = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({
        w: Math.max(1, Math.round(r.width)),
        h: Math.max(1, Math.round(r.height)),
      });
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Bbox derived from center + halfM, aspect-matched to container.
  const bbox = useMemo(() => {
    if (!center) return null;
    const lat = center.lat;
    const lng = center.lng;
    const dLat = halfM / 111000;
    const dLng = halfM / (111000 * Math.cos((lat * Math.PI) / 180));
    let minLat = lat - dLat;
    let maxLat = lat + dLat;
    let minLng = lng - dLng;
    let maxLng = lng + dLng;
    // Expand on the axis that needs it so bbox aspect = container aspect.
    const cosMid = Math.cos((lat * Math.PI) / 180);
    const lngMeters = (maxLng - minLng) * cosMid * 111000;
    const latMeters = (maxLat - minLat) * 111000;
    const containerAspect = size.w / size.h;
    const bboxAspect = lngMeters / latMeters;
    if (bboxAspect > containerAspect) {
      const targetLatMeters = lngMeters / containerAspect;
      const extra = (targetLatMeters - latMeters) / 2 / 111000;
      minLat -= extra;
      maxLat += extra;
    } else if (bboxAspect < containerAspect) {
      const targetLngMeters = latMeters * containerAspect;
      const extra =
        (targetLngMeters - lngMeters) / 2 / (111000 * cosMid);
      minLng -= extra;
      maxLng += extra;
    }
    return { minLat, maxLat, minLng, maxLng };
  }, [center, halfM, size.w, size.h]);

  const tileUrl = useMemo(() => {
    if (!MAPBOX_TOKEN || !bbox) return null;
    const reqW = Math.min(1280, Math.max(64, Math.round(size.w)));
    const reqH = Math.min(1280, Math.max(64, Math.round(size.h)));
    return `https://api.mapbox.com/styles/v1/mapbox/satellite-v9/static/[${bbox.minLng.toFixed(
      6,
    )},${bbox.minLat.toFixed(6)},${bbox.maxLng.toFixed(6)},${bbox.maxLat.toFixed(
      6,
    )}]/${reqW}x${reqH}@2x?access_token=${MAPBOX_TOKEN}&attribution=false&logo=false`;
  }, [MAPBOX_TOKEN, bbox, size.w, size.h]);

  // Linear-in-lng, Mercator-in-lat projection. View-space coords go
  // from 0..size.w / 0..size.h.
  const project = (lat: number, lng: number) => {
    if (!bbox) return { cx: 0, cy: 0 };
    const cx = ((lng - bbox.minLng) / (bbox.maxLng - bbox.minLng)) * size.w;
    const minMercY = mercY(bbox.minLat);
    const maxMercY = mercY(bbox.maxLat);
    const cy =
      size.h - ((mercY(lat) - minMercY) / (maxMercY - minMercY)) * size.h;
    return { cx, cy };
  };

  const unproject = (cx: number, cy: number) => {
    if (!bbox) return { lat: 0, lng: 0 };
    const lng = bbox.minLng + (cx / size.w) * (bbox.maxLng - bbox.minLng);
    const minMercY = mercY(bbox.minLat);
    const maxMercY = mercY(bbox.maxLat);
    const my = minMercY + ((size.h - cy) / size.h) * (maxMercY - minMercY);
    return { lat: inverseMercY(my), lng };
  };

  // Click on the map: if a target hole+kind is selected, save that
  // lat/lng. Otherwise no-op (the user has to pick a pin first).
  const onMapClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!target) {
      toast.info("Pick a pin from the sidebar first.");
      return;
    }
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * size.w;
    const cy = ((e.clientY - rect.top) / rect.height) * size.h;
    const { lat, lng } = unproject(cx, cy);
    const targetSnapshot = target;

    if (targetSnapshot.kind === "water" || targetSnapshot.kind === "sand") {
      const hazardKind = targetSnapshot.kind.toUpperCase();
      // Optimistic add with a temp id so the marker shows up
      // immediately. The real DB id gets reconciled on refresh; in
      // the meantime any delete attempt against the temp id is a
      // no-op (action catches missing rows silently).
      const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setHazards((cur) => [
        ...cur,
        { id: tempId, hole: targetSnapshot.hole, kind: hazardKind, lat, lng },
      ]);
      const fd = new FormData();
      fd.set("courseName", courseName);
      fd.set("hole", String(targetSnapshot.hole));
      fd.set("kind", hazardKind);
      fd.set("lat", String(lat));
      fd.set("lng", String(lng));
      startTransition(async () => {
        try {
          await markHazardAction(fd);
          toast.success(
            `Added ${targetSnapshot.kind} on hole ${targetSnapshot.hole}`,
          );
          // Keep the same target so the user can chain several
          // bunkers / water carries on one hole without bouncing
          // back to the sidebar.
          router.refresh();
        } catch (err) {
          // Roll back the optimistic marker on failure.
          setHazards((cur) => cur.filter((h) => h.id !== tempId));
          toast.error((err as Error).message);
        }
      });
      return;
    }

    // Tee or green pin -- existing behaviour.
    setHoles((cur) =>
      cur.map((h) => {
        if (h.hole !== targetSnapshot.hole) return h;
        if (targetSnapshot.kind === "tee")
          return { ...h, teeLat: lat, teeLng: lng };
        return { ...h, greenLat: lat, greenLng: lng };
      }),
    );
    const fd = new FormData();
    fd.set("courseName", courseName);
    fd.set("hole", String(targetSnapshot.hole));
    fd.set("kind", targetSnapshot.kind);
    fd.set("lat", String(lat));
    fd.set("lng", String(lng));
    startTransition(async () => {
      try {
        await adminSaveHoleGeoAction(fd);
        toast.success(
          `Saved ${targetSnapshot.kind} for hole ${targetSnapshot.hole}`,
        );
        // Auto-advance: if we just set the tee, queue up the green
        // for the same hole; if we just set the green, queue up the
        // next hole's tee. Small but compounds.
        if (targetSnapshot.kind === "tee") {
          setTarget({ hole: targetSnapshot.hole, kind: "green" });
        } else if (targetSnapshot.hole < holes.length) {
          setTarget({ hole: targetSnapshot.hole + 1, kind: "tee" });
        } else {
          setTarget(null);
        }
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  // Hazard click handler: confirm + delete. Reachable only when no
  // target is set (placement mode trumps deletion).
  const onHazardClick = (hz: Hazard) => {
    if (target) return;
    if (!window.confirm(`Delete this ${hz.kind.toLowerCase()} hazard?`)) return;
    setHazards((cur) => cur.filter((h) => h.id !== hz.id));
    const fd = new FormData();
    fd.set("hazardId", hz.id);
    startTransition(async () => {
      try {
        await deleteHazardAction(fd);
        toast.success("Hazard removed");
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const renameCourse = () => {
    const proposed = window.prompt(
      `Rename "${courseName}" to:`,
      courseName,
    );
    if (!proposed) return;
    const next = proposed.trim();
    if (!next || next === courseName) return;
    const fd = new FormData();
    fd.set("oldName", courseName);
    fd.set("newName", next);
    startTransition(async () => {
      try {
        const r = await adminRenameCourseAction(fd);
        toast.success(`Renamed to "${r.newName}"`);
        router.push(`/admin/courses/${encodeURIComponent(r.newName)}`);
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const clearPin = (hole: number, kind: "tee" | "green") => {
    setHoles((cur) =>
      cur.map((h) => {
        if (h.hole !== hole) return h;
        if (kind === "tee")
          return { ...h, teeLat: null, teeLng: null };
        return { ...h, greenLat: null, greenLng: null };
      }),
    );
    const fd = new FormData();
    fd.set("courseName", courseName);
    fd.set("hole", String(hole));
    fd.set("kind", kind);
    startTransition(async () => {
      try {
        await adminClearHoleGeoAction(fd);
        toast.success(`Cleared ${kind} for hole ${hole}`);
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  // Swap the active tee on a hole to one of the alternate teeboxes
  // Golfbert returned at import time. No Golfbert call -- the
  // coordinates are already stored on CourseHole.teeAlternativesJson;
  // we just re-write teeLat/teeLng via the same admin save action
  // that the click-to-move flow uses.
  const pickAltTee = (hole: number, a: TeeAlternative) => {
    setHoles((cur) =>
      cur.map((h) =>
        h.hole === hole ? { ...h, teeLat: a.lat, teeLng: a.lng } : h,
      ),
    );
    const fd = new FormData();
    fd.set("courseName", courseName);
    fd.set("hole", String(hole));
    fd.set("kind", "tee");
    fd.set("lat", String(a.lat));
    fd.set("lng", String(a.lng));
    startTransition(async () => {
      try {
        await adminSaveHoleGeoAction(fd);
        toast.success(
          `Hole ${hole} tee → ${a.color || a.teeboxtype || "alt"}` +
            (a.yds != null ? ` (${a.yds}y)` : ""),
        );
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  // Pan by ~half the bbox in the given direction.
  const pan = (dx: number, dy: number) => {
    if (!center) return;
    const step = halfM * 0.5;
    const lat = center.lat + (dy * step) / 111000;
    const lng =
      center.lng +
      (dx * step) /
        (111000 * Math.cos((center.lat * Math.PI) / 180));
    setCenter({ lat, lng });
  };
  const zoom = (factor: number) => {
    setHalfM((cur) => Math.max(50, Math.min(5000, cur * factor)));
  };

  // Drag-to-pan on the map for free movement.
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startCenter: { lat: number; lng: number };
  } | null>(null);
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!center) return;
    if (!e.shiftKey) {
      // Plain click reserved for placing pins. Shift+drag pans.
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startCenter: { ...center },
    };
  };
  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const d = dragRef.current;
    if (!d || !bbox) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dxPx = e.clientX - d.startX;
    const dyPx = e.clientY - d.startY;
    const lngSpan = bbox.maxLng - bbox.minLng;
    const latSpan = bbox.maxLat - bbox.minLat;
    const newLng = d.startCenter.lng - (dxPx / rect.width) * lngSpan;
    const newLat = d.startCenter.lat + (dyPx / rect.height) * latSpan;
    setCenter({ lat: newLat, lng: newLng });
  };
  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  };

  // --- "No center yet" prompt ---
  if (!center) {
    return <NoCenterPrompt courseName={courseName} city={city} />;
  }

  const completed = holes.filter(
    (h) => h.teeLat != null && h.greenLat != null,
  ).length;

  return (
    <div className="flex flex-col h-[calc(100vh-3rem)]">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-mute leading-tight">
            <Link href="/admin/courses" className="hover:text-ink">
              ← Courses
            </Link>
          </div>
          <div className="font-medium truncate text-sm">{courseName}</div>
          {city && <div className="text-[10px] text-mute">{city}</div>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={renameCourse}
            disabled={pending}
            className="text-[11px] text-mute hover:text-ink underline disabled:opacity-50"
          >
            Rename
          </button>
          <Link
            href={`/admin/courses/${encodeURIComponent(courseName)}/preview`}
            className="text-[11px] text-mute hover:text-ink underline"
          >
            Preview holes
          </Link>
          <div className="text-[11px] text-mute font-mono">
            {completed}/{holes.length} done
          </div>
        </div>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Map */}
        <div
          ref={wrapRef}
          className="relative flex-1 min-w-0 bg-panel2/40 overflow-hidden"
        >
          {tileUrl && size.w > 0 && size.h > 0 && (
            <svg
              viewBox={`0 0 ${size.w} ${size.h}`}
              className={
                "w-full h-full block " +
                (target ? "cursor-crosshair" : "cursor-grab")
              }
              preserveAspectRatio="none"
              onClick={onMapClick}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
            >
              <image
                href={tileUrl}
                xlinkHref={tileUrl}
                x="0"
                y="0"
                width={size.w}
                height={size.h}
                preserveAspectRatio="none"
              />
              {/* Hazards: small colored dots, click to delete (only
                  when no target is active so we don't intercept
                  placement clicks). */}
              {hazards.map((hz) => {
                const { cx, cy } = project(hz.lat, hz.lng);
                const fill =
                  hz.kind === "WATER"
                    ? "#3b82f6"
                    : hz.kind === "SAND"
                      ? "#d4a85c"
                      : "#94a3b8";
                return (
                  <g
                    key={hz.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      onHazardClick(hz);
                    }}
                    style={{ cursor: target ? "crosshair" : "pointer" }}
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r="5"
                      fill={fill}
                      fillOpacity="0.85"
                      stroke="#0b0f0c"
                      strokeWidth="1"
                    />
                  </g>
                );
              })}
              {/* All saved pins. Tee = small dark square, green = circle. */}
              {holes.flatMap((h) => {
                const out = [] as React.ReactElement[];
                if (h.teeLat != null && h.teeLng != null) {
                  const { cx, cy } = project(h.teeLat, h.teeLng);
                  out.push(
                    <g key={`t-${h.hole}`}>
                      <rect
                        x={cx - 7}
                        y={cy - 5}
                        width="14"
                        height="10"
                        rx="2"
                        fill="#161f1b"
                        stroke="#e8f0ea"
                        strokeWidth="1.5"
                      />
                      <text
                        x={cx}
                        y={cy + 3.5}
                        textAnchor="middle"
                        fontSize="8"
                        fill="#e8f0ea"
                        style={{ fontFamily: "monospace" }}
                      >
                        {h.hole}
                      </text>
                    </g>,
                  );
                }
                if (h.greenLat != null && h.greenLng != null) {
                  const { cx, cy } = project(h.greenLat, h.greenLng);
                  out.push(
                    <g key={`g-${h.hole}`}>
                      <circle
                        cx={cx}
                        cy={cy}
                        r="9"
                        fill="#34d399"
                        fillOpacity="0.35"
                        stroke="#34d399"
                        strokeWidth="1.5"
                      />
                      <text
                        x={cx}
                        y={cy + 3}
                        textAnchor="middle"
                        fontSize="8"
                        fill="#0b0f0c"
                        style={{ fontFamily: "monospace", fontWeight: 600 }}
                      >
                        {h.hole}
                      </text>
                    </g>,
                  );
                }
                return out;
              })}
            </svg>
          )}

          {/* Floating controls */}
          <div className="absolute top-2 left-2 flex flex-col gap-1">
            <div className="flex flex-col items-center gap-0.5 bg-bg/70 backdrop-blur-md border border-border rounded-md p-1 shadow-lg pointer-events-auto">
              <button
                type="button"
                onClick={() => pan(0, 1)}
                className="btn btn-ghost h-7 w-7 px-0 text-xs"
                aria-label="Pan north"
              >
                ↑
              </button>
              <div className="flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => pan(-1, 0)}
                  className="btn btn-ghost h-7 w-7 px-0 text-xs"
                  aria-label="Pan west"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => pan(1, 0)}
                  className="btn btn-ghost h-7 w-7 px-0 text-xs"
                  aria-label="Pan east"
                >
                  →
                </button>
              </div>
              <button
                type="button"
                onClick={() => pan(0, -1)}
                className="btn btn-ghost h-7 w-7 px-0 text-xs"
                aria-label="Pan south"
              >
                ↓
              </button>
            </div>
            <div className="flex items-center gap-0.5 bg-bg/70 backdrop-blur-md border border-border rounded-md p-1 shadow-lg pointer-events-auto">
              <button
                type="button"
                onClick={() => zoom(0.6)}
                className="btn btn-ghost h-7 w-7 px-0 text-sm"
                aria-label="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => zoom(1.7)}
                className="btn btn-ghost h-7 w-7 px-0 text-sm"
                aria-label="Zoom out"
              >
                −
              </button>
            </div>
          </div>

          {target && (
            <div className="absolute top-2 right-2 rounded-md bg-accent/90 text-bg px-3 py-1.5 text-xs font-medium shadow-lg pointer-events-none">
              {target.kind === "water" || target.kind === "sand"
                ? `Tap map to add ${target.kind} on hole ${target.hole} (chain multiple)`
                : `Tap map to set ${target.kind} for hole ${target.hole}`}
            </div>
          )}
          {!target && (
            <div className="absolute bottom-2 left-2 rounded-md bg-bg/70 backdrop-blur-md border border-border px-2 py-1 text-[10px] text-mute pointer-events-none">
              Pick a pin from the sidebar, then click the map. Tap an
              existing hazard to delete. Shift+drag to pan.
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-72 shrink-0 border-l border-border overflow-y-auto bg-panel/40">
          <div className="p-3 border-b border-border">
            <GolfBertPanel courseName={courseName} />
          </div>
          <ul className="divide-y divide-border">
            {holes.map((h) => {
              const teeSet = h.teeLat != null && h.teeLng != null;
              const greenSet = h.greenLat != null && h.greenLng != null;
              const isTarget = (k: "tee" | "green" | "water" | "sand") =>
                target?.hole === h.hole && target.kind === k;
              const holeHazardCount = hazards.filter(
                (hz) => hz.hole === h.hole,
              ).length;
              return (
                <li key={h.hole} className="px-3 py-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-medium">Hole {h.hole}</div>
                    <div className="text-[10px] text-mute font-mono">
                      {teeSet ? "T ✓" : "T –"}{" "}
                      {greenSet ? "G ✓" : "G –"}{" "}
                      {holeHazardCount > 0 ? `H ${holeHazardCount}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setTarget({ hole: h.hole, kind: "tee" })
                      }
                      disabled={pending}
                      className={
                        "btn h-7 text-[11px] flex-1 " +
                        (isTarget("tee")
                          ? "btn-primary"
                          : teeSet
                            ? "btn-ghost"
                            : "btn-ghost")
                      }
                    >
                      {teeSet ? "Move tee" : "Set tee"}
                    </button>
                    {teeSet && (
                      <button
                        type="button"
                        onClick={() => clearPin(h.hole, "tee")}
                        disabled={pending}
                        className="btn btn-ghost h-7 w-7 px-0 text-mute text-xs"
                        title="Clear tee"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {h.teeAlternatives.length > 1 && (
                    <AltTeeStrip
                      alternates={h.teeAlternatives}
                      teeLat={h.teeLat}
                      teeLng={h.teeLng}
                      pending={pending}
                      onPick={(a) => pickAltTee(h.hole, a)}
                    />
                  )}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setTarget({ hole: h.hole, kind: "green" })
                      }
                      disabled={pending}
                      className={
                        "btn h-7 text-[11px] flex-1 " +
                        (isTarget("green")
                          ? "btn-primary"
                          : greenSet
                            ? "btn-ghost"
                            : "btn-ghost")
                      }
                    >
                      {greenSet ? "Move green" : "Set green"}
                    </button>
                    {greenSet && (
                      <button
                        type="button"
                        onClick={() => clearPin(h.hole, "green")}
                        disabled={pending}
                        className="btn btn-ghost h-7 w-7 px-0 text-mute text-xs"
                        title="Clear green"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  {/* Hazard buttons. Placement stays in "add" mode after
                      each click so you can chain several bunkers / water
                      carries on the same hole without bouncing back to
                      the sidebar. */}
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setTarget(
                          isTarget("water")
                            ? null
                            : { hole: h.hole, kind: "water" },
                        )
                      }
                      disabled={pending}
                      className={
                        "btn h-7 text-[11px] flex-1 " +
                        (isTarget("water") ? "btn-primary" : "btn-ghost")
                      }
                    >
                      {isTarget("water") ? "Stop water" : "+ Water"}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setTarget(
                          isTarget("sand")
                            ? null
                            : { hole: h.hole, kind: "sand" },
                        )
                      }
                      disabled={pending}
                      className={
                        "btn h-7 text-[11px] flex-1 " +
                        (isTarget("sand") ? "btn-primary" : "btn-ghost")
                      }
                    >
                      {isTarget("sand") ? "Stop sand" : "+ Sand"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}

// First-time prompt: ask the admin to provide the course's center
// lat/lng or use the browser's current location. Saves on submit and
// Per-hole tee-color picker. Renders one chip per alternate that
// Golfbert sent for the hole, with the active one highlighted.
// Tapping a chip snaps the saved tee to that box without re-fetching
// from Golfbert.
function AltTeeStrip({
  alternates,
  teeLat,
  teeLng,
  pending,
  onPick,
}: {
  alternates: TeeAlternative[];
  teeLat: number | null;
  teeLng: number | null;
  pending: boolean;
  onPick: (a: TeeAlternative) => void;
}) {
  // Sort by yardage so the picker reads tip-to-forward.
  const sorted = [...alternates].sort(
    (a, b) =>
      (b.yds ?? Number.NEGATIVE_INFINITY) -
      (a.yds ?? Number.NEGATIVE_INFINITY),
  );
  // Match the active alternate by lat/lng equality (~1e-6 tolerance).
  const isActive = (a: TeeAlternative) =>
    teeLat != null &&
    teeLng != null &&
    Math.abs(a.lat - teeLat) < 1e-6 &&
    Math.abs(a.lng - teeLng) < 1e-6;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      <span className="text-[9px] uppercase tracking-wider text-mute pr-1">
        Tees
      </span>
      {sorted.map((a, i) => {
        const active = isActive(a);
        const label =
          (a.color || a.teeboxtype || `t${i + 1}`).toLowerCase();
        return (
          <button
            key={`${a.lat},${a.lng},${i}`}
            type="button"
            onClick={() => onPick(a)}
            disabled={pending || active}
            title={
              active
                ? "Currently selected"
                : `Switch to ${label}${a.yds != null ? ` (${a.yds}y)` : ""}`
            }
            className={
              "px-1.5 py-0.5 rounded text-[10px] font-mono border " +
              (active
                ? "border-accent text-accent bg-accent/10"
                : "border-border text-mute hover:text-ink hover:border-mute")
            }
          >
            {label}
            {a.yds != null && (
              <span className="ml-1 text-[9px] opacity-70">{a.yds}y</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// the editor reloads with the center set.
function NoCenterPrompt({
  courseName,
  city,
}: {
  courseName: string;
  city: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");

  const submit = (la: number, ln: number) => {
    const fd = new FormData();
    fd.set("courseName", courseName);
    fd.set("lat", String(la));
    fd.set("lng", String(ln));
    startTransition(async () => {
      try {
        await adminSetCourseCenterAction(fd);
        toast.success("Center saved");
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  };

  const useGps = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      toast.error("Geolocation not available");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => submit(p.coords.latitude, p.coords.longitude),
      (err) => toast.error(err.message),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const useTyped = (e: React.FormEvent) => {
    e.preventDefault();
    const la = Number(lat);
    const ln = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(ln)) {
      toast.error("Lat/lng must be numbers");
      return;
    }
    submit(la, ln);
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8 space-y-4">
      <div>
        <Link
          href="/admin/courses"
          className="text-[10px] uppercase tracking-wider text-mute hover:text-ink"
        >
          ← Courses
        </Link>
        <h1 className="font-display text-xl font-semibold mt-1">
          {courseName}
        </h1>
        {city && <div className="text-[12px] text-mute">{city}</div>}
      </div>
      <p className="text-sm text-mute">
        No center coordinates saved yet. Either import the course from
        GolfBert (the center comes with it) or seed a starting point
        from your current GPS location / pasted lat-lng.
      </p>

      {/* GolfBert import skips the rest of this prompt: the import
          sets centerLat/Lng + every hole's geometry in one go, then
          the editor reloads into its full view. */}
      <div className="rounded-md border border-border bg-panel/40 p-3">
        <GolfBertPanel courseName={courseName} />
      </div>

      <div className="text-[10px] uppercase tracking-wider text-mute text-center">
        or seed a starting point manually
      </div>
      <button
        type="button"
        onClick={useGps}
        disabled={pending}
        className="btn btn-primary w-full"
      >
        Use my current location
      </button>
      <div className="text-[10px] uppercase tracking-wider text-mute text-center">
        or paste coordinates
      </div>
      <form onSubmit={useTyped} className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input
            className="input"
            placeholder="Latitude"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            inputMode="decimal"
          />
          <input
            className="input"
            placeholder="Longitude"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            inputMode="decimal"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="btn btn-ghost w-full"
        >
          Save center
        </button>
      </form>
      <p className="text-[10px] text-mute">
        Tip: in Google Maps, right-click the course on the map and copy
        the lat/lng pair that appears at the top of the menu.
      </p>
    </div>
  );
}
