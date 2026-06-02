"use client";

// Mapbox GL JS version of HoleMiniMap. Same prop interface as the
// static-tile original so callers can flip a single `engine` prop to
// try it.
//
// What you get over the static implementation:
//   - Native pinch / pan / zoom that stays sharp at every level
//     (vector tiles + WebGL, not an upscaled PNG).
//   - Pan past the bbox into the surrounding terrain.
//   - HTML markers stay anchored to lat/lng natively -- no more
//     manual projection math, no inverse-scale dance to keep pills
//     a constant on-screen size.
//
// What's intentionally NOT here in v1 (still on the static path):
//   - Tap-to-aim, aim line, range rings.
//   - Calibration chips (+ Mark front / back / tee).
//   - Empty-state prompts for unmapped holes.
//   - Preset chip integration (Tee / Mid / Green / Hole).
// These come in follow-up PRs once the base render proves out.

import { useEffect, useMemo, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

type Pt = { lat: number; lng: number };
type Hazard = Pt & {
  id: string;
  kind: "WATER" | "SAND" | "OOB" | "OTHER";
};

export type Landmark = {
  id: string;
  lat: number;
  lng: number;
  prefix?: string;
  yds: number;
  orientation?: "above" | "below";
  variant?: "default" | "tiny" | "accent";
  tone?: "white" | "sand" | "water";
  dim?: boolean;
};

const HAZARD_FILL: Record<Hazard["kind"], string> = {
  WATER: "#60a5fa",
  SAND: "#fbbf24",
  OOB: "#f87171",
  OTHER: "#8aa094",
};

export default function HoleMiniMapGL({
  player,
  tee,
  greenCenter,
  greenFront,
  greenBack,
  greenPolygon,
  hazards,
  landmarks,
}: {
  player: Pt | null;
  tee: Pt | null;
  greenCenter: Pt | null;
  greenFront: Pt | null;
  greenBack: Pt | null;
  greenPolygon: Pt[] | null;
  hazards: Hazard[];
  landmarks?: Landmark[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  // HTML markers we own and need to clean up between renders. GL JS
  // doesn't track them, so we keep our own roster keyed by feature
  // id.
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());

  // Bounding box of everything we want visible -- we fit to this on
  // mount so the whole hole lands in view.
  const bbox = useMemo(() => {
    const pts: Pt[] = [];
    if (player) pts.push(player);
    if (tee) pts.push(tee);
    if (greenCenter) pts.push(greenCenter);
    if (greenFront) pts.push(greenFront);
    if (greenBack) pts.push(greenBack);
    if (greenPolygon) for (const p of greenPolygon) pts.push(p);
    for (const h of hazards) pts.push(h);
    if (landmarks) for (const l of landmarks) pts.push({ lat: l.lat, lng: l.lng });
    if (pts.length === 0) return null;
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [
    player,
    tee,
    greenCenter,
    greenFront,
    greenBack,
    greenPolygon,
    hazards,
    landmarks,
  ]);

  // One-time map init. We tear down on unmount; layers / markers
  // for a given hole are reconciled in the effects below.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    if (!token) {
      // No token = no map. The static path falls back to a flat
      // schematic; here we just stay empty until the env var is set.
      return;
    }
    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/satellite-v9",
      // Center + zoom land here; the bbox-fit effect snaps to the
      // actual hole the first time bbox is available.
      center: [-118, 34],
      zoom: 14,
      // Killing the rotate/pitch controls keeps the view top-down
      // like the old SVG. Easy to enable later if we want a 3D mode.
      pitch: 0,
      bearing: 0,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
    });
    map.touchZoomRotate.disableRotation();

    mapRef.current = map;

    return () => {
      // Drop any markers we own first so they don't leak references
      // into a destroyed map instance.
      for (const m of markersRef.current.values()) m.remove();
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Fit to bbox whenever it changes (e.g. user switches holes). GL JS
  // animates the camera by default -- a tight fitBounds with a small
  // padding lands the hole comfortably in view with a sliver of
  // surrounding context.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bbox) return;
    const apply = () => {
      map.fitBounds(
        [
          [bbox.minLng, bbox.minLat],
          [bbox.maxLng, bbox.maxLat],
        ],
        {
          padding: 40,
          duration: 0,
          maxZoom: 19,
        },
      );
    };
    if (map.loaded()) {
      apply();
    } else {
      map.once("load", apply);
    }
  }, [bbox]);

  // Green polygon + tee/green markers + hazards. Re-runs whenever
  // those props change. We add sources/layers once the style is
  // loaded; subsequent runs reuse them via `setData`.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const onReady = () => {
      // -- Green polygon (fill + outline) ----------------------------
      const greenFC: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: greenPolygon
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    // GeoJSON wants the ring closed (first == last).
                    [
                      ...greenPolygon.map((p) => [p.lng, p.lat] as [number, number]),
                      [greenPolygon[0].lng, greenPolygon[0].lat] as [
                        number,
                        number,
                      ],
                    ],
                  ],
                },
              },
            ]
          : [],
      };
      if (map.getSource("green-poly")) {
        (map.getSource("green-poly") as mapboxgl.GeoJSONSource).setData(greenFC);
      } else {
        map.addSource("green-poly", { type: "geojson", data: greenFC });
        map.addLayer({
          id: "green-poly-fill",
          type: "fill",
          source: "green-poly",
          paint: {
            "fill-color": "#34d399",
            "fill-opacity": 0.18,
          },
        });
        map.addLayer({
          id: "green-poly-stroke",
          type: "line",
          source: "green-poly",
          paint: {
            "line-color": "#34d399",
            "line-width": 2,
            "line-opacity": 0.7,
          },
        });
      }

      // -- Hazard circles --------------------------------------------
      const hazardFC: GeoJSON.FeatureCollection = {
        type: "FeatureCollection",
        features: hazards.map((h) => ({
          type: "Feature",
          properties: { kind: h.kind },
          geometry: { type: "Point", coordinates: [h.lng, h.lat] },
        })),
      };
      if (map.getSource("hazards")) {
        (map.getSource("hazards") as mapboxgl.GeoJSONSource).setData(hazardFC);
      } else {
        map.addSource("hazards", { type: "geojson", data: hazardFC });
        map.addLayer({
          id: "hazards-circle",
          type: "circle",
          source: "hazards",
          paint: {
            "circle-radius": 8,
            "circle-color": [
              "match",
              ["get", "kind"],
              "WATER",
              HAZARD_FILL.WATER,
              "SAND",
              HAZARD_FILL.SAND,
              "OOB",
              HAZARD_FILL.OOB,
              HAZARD_FILL.OTHER,
            ],
            "circle-opacity": 0.55,
            "circle-stroke-color": [
              "match",
              ["get", "kind"],
              "WATER",
              HAZARD_FILL.WATER,
              "SAND",
              HAZARD_FILL.SAND,
              "OOB",
              HAZARD_FILL.OOB,
              HAZARD_FILL.OTHER,
            ],
            "circle-stroke-width": 1,
          },
        });
      }

      // -- Tee + green-center markers --------------------------------
      // Both rendered as small HTML markers so they pan/zoom with the
      // map but stay constant size on screen (GL JS keeps the anchor
      // welded to the lat/lng).
      const upsertMarker = (
        id: string,
        coords: Pt | null,
        build: () => HTMLElement,
      ) => {
        const existing = markersRef.current.get(id);
        if (!coords) {
          if (existing) {
            existing.remove();
            markersRef.current.delete(id);
          }
          return;
        }
        if (existing) {
          existing.setLngLat([coords.lng, coords.lat]);
          return;
        }
        const el = build();
        const m = new mapboxgl.Marker({ element: el, anchor: "center" })
          .setLngLat([coords.lng, coords.lat])
          .addTo(map);
        markersRef.current.set(id, m);
      };

      upsertMarker("tee", tee, () => {
        const el = document.createElement("div");
        el.style.cssText =
          "width:14px;height:10px;border-radius:2px;" +
          "background:#161f1b;border:1px solid #8aa094;";
        el.setAttribute("aria-label", "Tee");
        return el;
      });

      upsertMarker("green-center", greenCenter, () => {
        const el = document.createElement("div");
        el.style.cssText =
          "width:14px;height:14px;border-radius:50%;" +
          "background:#34d399;border:2px solid #ffffff;" +
          "box-shadow:0 1px 4px rgba(0,0,0,0.5);";
        el.setAttribute("aria-label", "Pin");
        return el;
      });

      upsertMarker("player", player, () => {
        const el = document.createElement("div");
        el.style.cssText =
          "width:14px;height:14px;border-radius:50%;" +
          "background:#60a5fa;border:2px solid #ffffff;" +
          "box-shadow:0 1px 4px rgba(0,0,0,0.6);";
        el.setAttribute("aria-label", "Your position");
        return el;
      });
    };
    if (map.isStyleLoaded()) {
      onReady();
    } else {
      map.once("style.load", onReady);
    }
  }, [tee, greenCenter, player, greenPolygon, hazards]);

  // Yardage pills as HTML markers. Rebuilt fresh on every change
  // because the pill bodies are cheap and rebuilding is simpler than
  // reconciling per-pill style.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      // Clean up any landmark markers from a prior render.
      for (const [id, m] of markersRef.current.entries()) {
        if (id.startsWith("lm-")) {
          m.remove();
          markersRef.current.delete(id);
        }
      }
      if (!landmarks) return;
      for (const l of landmarks) {
        const el = buildLandmarkEl(l);
        const m = new mapboxgl.Marker({
          element: el,
          anchor: l.orientation === "below" ? "top" : "bottom",
        })
          .setLngLat([l.lng, l.lat])
          .addTo(map);
        markersRef.current.set(`lm-${l.id}`, m);
      }
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("style.load", apply);
    }
  }, [landmarks]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      // Mapbox GL JS expects a real layout box; nothing magical here.
    />
  );
}

// Same pill DOM the static path renders, just built imperatively so
// we can hand it to mapboxgl.Marker as a custom element. Kept close
// to the static styling so the visual feels the same when we flip
// the flag.
function buildLandmarkEl(l: Landmark): HTMLElement {
  const orient = l.orientation ?? "above";
  const variant = l.variant ?? "default";
  const tone = l.tone ?? "white";
  const isAccent = variant === "accent";
  const isTiny = variant === "tiny";

  const wrap = document.createElement("div");
  wrap.style.cssText =
    "filter:drop-shadow(0 4px 8px rgba(0,0,0,0.5));" +
    "pointer-events:none;font-family:ui-monospace,monospace;" +
    (l.dim ? "opacity:0.5;" : "");

  const body = document.createElement("div");
  const bodyBg = isAccent
    ? "background:#34d399;color:#062118;"
    : tone === "sand"
      ? "background:rgba(255,255,255,0.95);color:#3a2d10;"
      : tone === "water"
        ? "background:rgba(255,255,255,0.95);color:#0d2b48;"
        : "background:#ffffff;color:#0b0f0c;";
  body.style.cssText =
    "display:inline-flex;align-items:baseline;gap:3px;" +
    "font-variant-numeric:tabular-nums;font-weight:600;" +
    (isTiny
      ? "padding:3px 6px;font-size:11px;border-radius:7px;"
      : "padding:4px 10px;font-size:15px;border-radius:10px;") +
    bodyBg;

  if (l.prefix) {
    const px = document.createElement("span");
    px.style.cssText =
      "text-transform:uppercase;font-weight:500;" +
      "letter-spacing:0.14em;margin-right:2px;" +
      (isTiny ? "font-size:7.5px;" : "font-size:8.5px;") +
      (isAccent
        ? "color:rgba(6,33,24,0.55);"
        : tone === "sand"
          ? "color:#8a7a4f;"
          : tone === "water"
            ? "color:#5d80a8;"
            : "color:#6b7c75;");
    px.textContent = l.prefix;
    body.appendChild(px);
  }
  body.appendChild(document.createTextNode(String(Math.round(l.yds))));
  const unit = document.createElement("span");
  unit.style.cssText =
    "font-weight:500;font-size:9px;" +
    (isAccent
      ? "color:rgba(6,33,24,0.55);"
      : tone === "sand"
        ? "color:#8a7a4f;"
        : tone === "water"
          ? "color:#5d80a8;"
          : "color:#6b7c75;");
  unit.textContent = "y";
  body.appendChild(unit);

  // Triangle tail. "above" -> tail at bottom pointing down. "below"
  // -> tail at top pointing up.
  const tail = document.createElement("div");
  const tailColor = isAccent ? "#34d399" : "#ffffff";
  const tailSize = isTiny ? 4 : 5;
  const tailH = isTiny ? 5 : 6;
  tail.style.cssText =
    "margin:0 auto;width:0;height:0;" +
    `border-left:${tailSize}px solid transparent;` +
    `border-right:${tailSize}px solid transparent;`;

  if (orient === "above") {
    wrap.appendChild(body);
    tail.style.cssText +=
      `border-top:${tailH}px solid ${tailColor};margin-top:-1px;`;
    wrap.appendChild(tail);
  } else {
    tail.style.cssText +=
      `border-bottom:${tailH}px solid ${tailColor};margin-bottom:-1px;`;
    wrap.appendChild(tail);
    wrap.appendChild(body);
  }

  return wrap;
}
