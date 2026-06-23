"use client";

// Photorealistic 3D preview of a single hole. Wraps deck.gl's Tile3DLayer
// against Google's Map Tiles API photogrammetric mesh (same data Google
// Earth uses). The camera plays a cinematic intro keyframe sequence on
// mount, then hands gestures to the user.
//
// Used as the 3D side of the 2D/3D toggle on:
//   - on-course HoleStudyMode (per-hole panel)
//   - standalone /courses/[name]/preview page
//   - scorecard tap → full-screen modal
//
// Falls back to a friendly "set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"
// placeholder when no key is configured so the rest of the app works
// fine in dev / on PRs / on contributors' forks.
//
// Cost guardrail: caps total tile fetches per session at MAX_TILE_LOADS
// (default 400). Once hit, the layer stops requesting new tiles --
// already-loaded mesh stays visible but the view freezes. A "Tap to
// resume" pill in the corner resets the counter so power users aren't
// permanently stuck.

import { useEffect, useMemo, useRef, useState } from "react";
import { DeckGL } from "@deck.gl/react";
import { Tile3DLayer } from "@deck.gl/geo-layers";
import { Tiles3DLoader } from "@loaders.gl/3d-tiles";
import {
  flightPathFor,
  type CameraKeyframe,
  type HoleEndpoints,
} from "@/lib/holeFlightPath";

const TILESET_URL = "https://tile.googleapis.com/v1/3dtiles/root.json";
// Raised from 400 -- normal panning + zooming chews through tiles
// faster than 400 anticipated, and the cap was crashing the view
// because hitting it unmounted the layer (taking already-loaded
// tiles with it). 5000 covers a long exploration session per hole
// while still defending against a runaway loop. Even a power user
// would need ~40 sessions/month to brush Google's 200k free-tier
// limit; budget alert on the GCP side is the real backstop.
const MAX_TILE_LOADS = 5000;

export type HolePreview3DProps = {
  hole: HoleEndpoints & {
    number?: number;
    par?: number;
    yards?: number;
  };
  // Stretches the canvas to the parent container; set explicit height
  // on the parent or pass an explicit height for fullscreen modals.
  height?: number | string;
  // Optional callback when the user taps the 2D toggle pill so the
  // parent (HoleStudyMode etc.) can switch back to its flat map.
  onRequest2D?: () => void;
};

type ViewState = {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
  transitionDuration?: number;
};

export default function HolePreview3D({
  hole,
  height = "100%",
  onRequest2D,
}: HolePreview3DProps) {
  const apiKey =
    typeof process !== "undefined"
      ? process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
      : undefined;
  const path = useRef<CameraKeyframe[]>(flightPathFor(hole));
  const [viewState, setViewState] = useState<ViewState>(() => ({
    ...path.current[0],
    transitionDuration: 0,
  }));
  // Three render-phase flags: hasFirstTile flips when the first tile
  // arrives (lets us drop the "Loading 3D mesh" overlay); errorMsg
  // surfaces a friendly message when the tileset endpoint fails (bad
  // key, referrer mismatch, quota, network); capped freezes new
  // fetches once we hit the session cost cap.
  const [hasFirstTile, setHasFirstTile] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const tileLoadCount = useRef(0);
  const [capped, setCapped] = useState(false);
  // Minimum time the loading scrim stays up after mount / hole change.
  // Without this, a fast first-tile arrival makes the spinner flash on
  // and immediately off again, which reads as a glitch.
  const MIN_LOADING_MS = 700;
  const [minLoadDone, setMinLoadDone] = useState(false);
  const hideLoadingScrim = hasFirstTile && minLoadDone;

  // Reset render-state flags when the hole changes so the spinner +
  // tile counter restart cleanly for the new hole. Also snap the
  // camera back to the establishing pose (behind the tee, looking
  // down the fairway) -- the flyover scheduler below picks it up
  // and animates the rest of the keyframes after the first tile
  // arrives.
  useEffect(() => {
    setHasFirstTile(false);
    setErrorMsg(null);
    setCapped(false);
    setMinLoadDone(false);
    tileLoadCount.current = 0;
    path.current = flightPathFor(hole);
    setViewState({ ...path.current[0], transitionDuration: 0 });
    const t = setTimeout(() => setMinLoadDone(true), MIN_LOADING_MS);
    return () => clearTimeout(t);
  }, [hole]);

  // Cinematic intro -- gated on first-tile arrival so the camera
  // doesn't animate through empty space before mesh exists. WARMUP_MS
  // lets a few extra tiles stream in around the establishing pose
  // before the camera moves. MAX_WAIT_MS is the fallback: if no tile
  // arrives the flyover plays anyway after 6s -- better than freezing
  // forever on a silent network failure.
  //
  // cancelFlyoverRef holds a cancel function the gesture handler can
  // call to drop all remaining keyframe timers the moment the user
  // touches the camera. Previously scheduled keyframes kept firing
  // after a user grabbed the camera, which made the flyover "fight"
  // the gesture -- yanking the pose back, sometimes spinning the
  // bearing the long way around the compass, and giving the impression
  // the camera never reached the green.
  const WARMUP_MS = 400;
  const MAX_WAIT_MS = 6000;
  const cancelFlyoverRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (errorMsg) return;
    const frames = path.current;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    function startFlyover() {
      if (cancelled) return;
      let cumulativeMs = 0;
      for (let i = 1; i < frames.length; i++) {
        const frame = frames[i];
        const t = setTimeout(() => {
          if (cancelled) return;
          setViewState({
            longitude: frame.longitude,
            latitude: frame.latitude,
            zoom: frame.zoom,
            pitch: frame.pitch,
            bearing: frame.bearing,
            transitionDuration: frame.transitionDuration,
          });
        }, cumulativeMs);
        timers.push(t);
        cumulativeMs += frame.transitionDuration;
      }
    }

    const kickoff = setTimeout(
      startFlyover,
      hasFirstTile ? WARMUP_MS : MAX_WAIT_MS,
    );
    timers.push(kickoff);

    function cancelAll() {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
    }
    cancelFlyoverRef.current = cancelAll;

    return () => {
      cancelAll();
      cancelFlyoverRef.current = null;
    };
    // Re-run whenever the hole changes (the reset effect above
    // flips hasFirstTile back to false, which retriggers this).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole, hasFirstTile, errorMsg]);

  function handleViewStateChange({
    viewState: vs,
    interactionState,
  }: {
    viewState: ViewState;
    // deck.gl populates this on view-state changes driven by user
    // gestures -- programmatic setViewState calls (i.e. our own
    // keyframe scheduler) pass it as undefined.
    interactionState?: {
      isDragging?: boolean;
      isPanning?: boolean;
      isRotating?: boolean;
      isZooming?: boolean;
    };
  }) {
    if (
      interactionState &&
      (interactionState.isDragging ||
        interactionState.isPanning ||
        interactionState.isRotating ||
        interactionState.isZooming)
    ) {
      cancelFlyoverRef.current?.();
    }
    setViewState(vs);
  }

  function resumeFromCap() {
    tileLoadCount.current = 0;
    setCapped(false);
  }

  if (!apiKey) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center bg-panel2 border border-border rounded-md text-center px-6"
      >
        <div className="space-y-1">
          <p className="text-sm text-ink font-medium">3D preview unavailable</p>
          <p className="text-[11px] text-mute leading-snug max-w-[18rem]">
            Set <code className="font-mono">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{" "}
            (Google Map Tiles API) to enable photorealistic 3D.
          </p>
          {onRequest2D && (
            <button
              type="button"
              onClick={onRequest2D}
              className="btn btn-ghost text-xs mt-2"
            >
              Use 2D
            </button>
          )}
        </div>
      </div>
    );
  }

  // Memoize the Tile3DLayer so it isn't recreated on every viewState
  // change. Deck.gl diffs layers by id, but a fresh instance every
  // render gives onTileLoad / onTileError new closure identities,
  // which can reset traverser state during user gestures and was
  // contributing to mid-pan blackouts. Stable dep list = [apiKey]
  // because that's the only thing that changes the layer URL; the
  // tileset itself is global, not per-hole.
  //
  // The cap NEVER nulls out the layer (that was the crash: removing
  // the layer unmounted every already-loaded tile from the GPU).
  // Instead we just stop bumping the counter once it's hit and let
  // the layer keep rendering whatever it has cached; the "Tap to
  // resume" pill is now a soft reset that lets new tile fetches
  // resume but doesn't gate the layer being mounted.
  const tile3d = useMemo(() => {
    if (!apiKey) return null;
    return new Tile3DLayer({
      id: "google-3d-tiles",
      data: `${TILESET_URL}?key=${apiKey}`,
      loader: Tiles3DLoader,
      onTileLoad: () => {
        tileLoadCount.current += 1;
        // Use the functional setter so this closure doesn't capture
        // a stale hasFirstTile value (the layer is memoized, so its
        // initial closure persists until apiKey changes).
        setHasFirstTile((prev) => prev || true);
        if (tileLoadCount.current >= MAX_TILE_LOADS) {
          setCapped((prev) => prev || true);
        }
      },
      // deck.gl's typings overload onTileError two ways (one tile +
      // url + message, one bare Error). We treat both as a generic
      // "tile fetch failed" and lift the human-readable text out
      // of whichever shape arrived.
      onTileError: ((...args: unknown[]) => {
        const arg = args[0];
        const message =
          typeof args[2] === "string"
            ? (args[2] as string)
            : arg instanceof Error
              ? arg.message
              : "3D tile load failed.";
        setErrorMsg((prev) =>
          prev
            ? prev
            : message.includes("403")
              ? "Google denied the tile request. Check the key's referrer restrictions + that Map Tiles API is enabled."
              : message,
        );
      }) as never,
    });
  }, [apiKey]);

  return (
    <div
      style={{ position: "relative", height, width: "100%", overflow: "hidden" }}
      className="rounded-md"
    >
      <DeckGL
        viewState={viewState}
        onViewStateChange={handleViewStateChange as never}
        // Enable tilt + rotate gestures so the user can orbit the
        // hole:
        //   - touchRotate: two-finger rotate AND two-finger drag to
        //     tilt the camera (off by default on mobile -- deck.gl's
        //     conservative touch baseline).
        //   - dragRotate: hold + drag with right-click / shift+drag
        //     on desktop also rotates / tilts (kept on for laptop
        //     users; harmless on touch since touchRotate already
        //     covers them).
        //   - doubleClickZoom off so tapping doesn't accidentally
        //     zoom past the establishing pose.
        controller={{
          doubleClickZoom: false,
          touchRotate: true,
          dragRotate: true,
        }}
        layers={tile3d ? [tile3d] : []}
        // Sky-to-grass gradient under the deck.gl canvas. When the
        // mesh hasn't streamed in yet (or there's a gap between
        // tiles) the user sees something map-shaped instead of the
        // page background, so the empty state reads as "loading"
        // rather than "broken".
        style={{
          background:
            "linear-gradient(180deg, #8fb6c8 0%, #b9c9b7 55%, #6e8c5c 100%)",
        }}
      />

      {/* Loading scrim -- shows until the first tile arrives. Stays
          up for at least MIN_LOADING_MS after mount so a quick
          first-tile arrival doesn't flash the spinner on / off, and
          uses a solid dark wash so the brand mark + text read
          against the sky-grass canvas underneath. */}
      {!hideLoadingScrim && !errorMsg && (
        <div className="absolute inset-0 flex items-center justify-center bg-[rgba(15,22,18,0.65)] backdrop-blur-sm pointer-events-none transition-opacity duration-300">
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <span className="relative inline-flex w-9 h-9 items-center justify-center">
              <span
                className="absolute inset-0 rounded-full border-2 border-white/30 border-t-white animate-spin"
                style={{ animationDuration: "0.9s" }}
              />
            </span>
            <div className="font-mono uppercase tracking-[0.16em] text-[10.5px] text-white/90 font-semibold">
              Loading 3D view
            </div>
            {hole.number != null && (
              <div className="font-mono text-[10px] text-white/60 tabular-nums">
                Hole {hole.number}
                {hole.par != null && ` · Par ${hole.par}`}
                {hole.yards != null && ` · ${hole.yards} yds`}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Error scrim -- friendly explanation when Google refuses the
          tileset (most common: key restricted to the wrong referrer
          or Map Tiles API not enabled). */}
      {errorMsg && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg/80 text-center px-6">
          <div className="space-y-2 max-w-sm">
            <p className="text-sm text-ink font-medium">3D preview failed</p>
            <p className="text-[11px] text-mute leading-snug">{errorMsg}</p>
            {onRequest2D && (
              <button
                type="button"
                onClick={onRequest2D}
                className="btn btn-ghost text-xs"
              >
                Use 2D
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom-left HUD: hole label + 2D toggle, mirroring the IG ref. */}
      <div className="absolute left-3 bottom-3 flex items-center gap-2">
        {onRequest2D && (
          <button
            type="button"
            onClick={onRequest2D}
            className="rounded-full bg-black/70 backdrop-blur text-white text-[11px] font-mono uppercase tracking-wider px-3 py-1 hover:bg-black/85"
          >
            2D
          </button>
        )}
        {(hole.number != null || hole.par != null || hole.yards != null) && (
          <div className="rounded-full bg-black/70 backdrop-blur text-white text-[11px] font-mono px-3 py-1">
            {hole.number != null && <span>Hole {hole.number}</span>}
            {hole.par != null && (
              <>
                <span className="opacity-60"> · </span>
                <span>Par {hole.par}</span>
              </>
            )}
            {hole.yards != null && (
              <>
                <span className="opacity-60"> · </span>
                <span>{hole.yards} yds</span>
              </>
            )}
          </div>
        )}
      </div>

      {capped && (
        <button
          type="button"
          onClick={resumeFromCap}
          className="absolute top-3 right-3 rounded-full bg-black/80 backdrop-blur text-white text-[11px] font-medium px-3 py-1.5 hover:bg-black"
        >
          Tap to resume
        </button>
      )}
    </div>
  );
}
