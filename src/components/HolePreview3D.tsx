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

import { useEffect, useRef, useState } from "react";
import { DeckGL } from "@deck.gl/react";
import { Tile3DLayer } from "@deck.gl/geo-layers";
import {
  flightPathFor,
  type CameraKeyframe,
  type HoleEndpoints,
} from "@/lib/holeFlightPath";

const TILESET_URL = "https://tile.googleapis.com/v1/3dtiles/root.json";
const MAX_TILE_LOADS = 400;

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
  const [tileLoads, setTileLoads] = useState(0);
  const [capped, setCapped] = useState(false);

  // Cinematic intro: walk through the keyframes after mount. Each
  // step's transitionDuration drives deck.gl's smooth interpolation;
  // we schedule the NEXT setViewState with a setTimeout matching the
  // CURRENT step's duration so the keyframes land in order.
  useEffect(() => {
    const frames = path.current;
    let cancelled = false;
    let cumulativeMs = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Skip frame 0 (it's the starting pose); transition into 1..N.
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
    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
    };
    // Intentionally fire once per hole change. flightPathFor is pure
    // so deriving path from the hole inside this effect would just
    // recompute the same array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hole.teeLat, hole.teeLng, hole.greenLat, hole.greenLng]);

  // When user grabs the camera, deck.gl emits view state updates with
  // no transitionDuration -- we just record them so the next render
  // doesn't reset to the last keyframe.
  function handleViewStateChange({ viewState: vs }: { viewState: ViewState }) {
    setViewState(vs);
  }

  function resumeFromCap() {
    setTileLoads(0);
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

  // The Tile3DLayer issues fetches as the camera moves. We tally them
  // and switch onTilesetLoad to a no-op data source once the cap hits.
  // Already-rendered tiles stay visible (deck.gl caches them in GPU).
  const tile3d = capped
    ? null
    : new Tile3DLayer({
        id: "google-3d-tiles",
        data: `${TILESET_URL}?key=${apiKey}`,
        loadOptions: {
          fetch: {
            headers: {
              // Google requires the standard Map Tiles header.
              "X-Goog-Maps-Api-Key": apiKey,
            },
          },
        },
        onTileLoad: () => {
          setTileLoads((n) => {
            const next = n + 1;
            if (next >= MAX_TILE_LOADS) setCapped(true);
            return next;
          });
        },
      });

  return (
    <div
      style={{ position: "relative", height, width: "100%", overflow: "hidden" }}
      className="rounded-md"
    >
      <DeckGL
        initialViewState={viewState}
        viewState={viewState}
        onViewStateChange={handleViewStateChange as never}
        controller={{ doubleClickZoom: false }}
        layers={tile3d ? [tile3d] : []}
        style={{ background: "rgb(var(--color-bg))" }}
      />
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

