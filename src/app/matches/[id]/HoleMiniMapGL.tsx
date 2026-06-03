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
  aim,
  onAim,
  mapRefProp,
}: {
  player: Pt | null;
  tee: Pt | null;
  greenCenter: Pt | null;
  greenFront: Pt | null;
  greenBack: Pt | null;
  greenPolygon: Pt[] | null;
  hazards: Hazard[];
  landmarks?: Landmark[];
  // Aim picker. When `onAim` is provided the map listens for clicks
  // and reports the lat/lng back. `aim` is the current aim location;
  // null = no aim, render a quiet player->pin reference line.
  aim?: Pt | null;
  onAim?: (latLng: Pt | null) => void;
  // Optional caller-owned ref. Mirrors the internal map instance so
  // the parent can drive things like flyTo (preset chips) without
  // converting HoleMiniMapGL into a forwardRef.
  mapRefProp?: React.MutableRefObject<mapboxgl.Map | null>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  // HTML markers we own and need to clean up between renders. GL JS
  // doesn't track them, so we keep our own roster keyed by feature
  // id.
  const markersRef = useRef<Map<string, mapboxgl.Marker>>(new Map());
  // Latest onAim in a ref so the one-time click listener never has
  // to be rebound on each render. Same trick GL JS suggests in its
  // examples.
  const onAimRef = useRef<typeof onAim>(onAim);
  useEffect(() => {
    onAimRef.current = onAim;
  }, [onAim]);

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

    // Tap-to-aim. The map gives us lngLat directly -- no projection
    // math like the static path needed -- so we just hand the coord
    // up. Crosshair cursor on the container signals tappability on
    // desktop; on touch it's invisible but harmless.
    map.on("click", (e) => {
      const cb = onAimRef.current;
      if (!cb) return;
      cb({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    mapRef.current = map;
    if (mapRefProp) mapRefProp.current = map;

    return () => {
      // Drop any markers we own first so they don't leak references
      // into a destroyed map instance.
      for (const m of markersRef.current.values()) m.remove();
      markersRef.current.clear();
      map.remove();
      mapRef.current = null;
      if (mapRefProp) mapRefProp.current = null;
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

      // Front + back green dots. Smaller than the center pin since
      // they're reference points, not the play target.
      upsertMarker("green-front", greenFront, () => {
        const el = document.createElement("div");
        el.style.cssText =
          "width:9px;height:9px;border-radius:50%;" +
          "background:#34d399;border:1.5px solid #ffffff;" +
          "box-shadow:0 1px 3px rgba(0,0,0,0.5);";
        el.setAttribute("aria-label", "Green front");
        return el;
      });
      upsertMarker("green-back", greenBack, () => {
        const el = document.createElement("div");
        el.style.cssText =
          "width:9px;height:9px;border-radius:50%;" +
          "background:#34d399;border:1.5px solid #ffffff;" +
          "box-shadow:0 1px 3px rgba(0,0,0,0.5);";
        el.setAttribute("aria-label", "Green back");
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
  }, [tee, greenCenter, greenFront, greenBack, player, greenPolygon, hazards]);

  // Aim layers: solid line player->aim, dashed line aim->pin, two
  // pixel-radius rings around the aim point, plus a quiet dashed
  // reference line player->pin when there's no aim yet. All managed
  // through GeoJSON sources/layers so panning + zooming keeps them
  // welded to lat/lng natively.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const apply = () => {
      const lineFC = (coords: Pt[] | null): GeoJSON.FeatureCollection => ({
        type: "FeatureCollection",
        features:
          coords && coords.length >= 2
            ? [
                {
                  type: "Feature",
                  properties: {},
                  geometry: {
                    type: "LineString",
                    coordinates: coords.map(
                      (p) => [p.lng, p.lat] as [number, number],
                    ),
                  },
                },
              ]
            : [],
      });
      const pointFC = (p: Pt | null): GeoJSON.FeatureCollection => ({
        type: "FeatureCollection",
        features: p
          ? [
              {
                type: "Feature",
                properties: {},
                geometry: { type: "Point", coordinates: [p.lng, p.lat] },
              },
            ]
          : [],
      });

      const aimSolid = aim && player ? lineFC([player, aim]) : lineFC(null);
      const aimDashed =
        aim && greenCenter ? lineFC([aim, greenCenter]) : lineFC(null);
      const aimPoint = pointFC(aim ?? null);
      const ref =
        !aim && player && greenCenter
          ? lineFC([player, greenCenter])
          : lineFC(null);

      const upsertSource = (
        id: string,
        data: GeoJSON.FeatureCollection,
      ) => {
        const existing = map.getSource(id);
        if (existing) {
          (existing as mapboxgl.GeoJSONSource).setData(data);
        } else {
          map.addSource(id, { type: "geojson", data });
        }
      };
      upsertSource("aim-solid", aimSolid);
      upsertSource("aim-dashed", aimDashed);
      upsertSource("aim-point", aimPoint);
      upsertSource("aim-ref", ref);

      // Reference line first, so the solid aim line layered above
      // paints over it once both exist.
      if (!map.getLayer("aim-ref")) {
        map.addLayer({
          id: "aim-ref",
          type: "line",
          source: "aim-ref",
          paint: {
            "line-color": "#34d399",
            "line-opacity": 0.35,
            "line-width": 1.5,
            "line-dasharray": [2, 3],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }
      // White halo behind the aim-solid line so it pops against
      // busy satellite imagery.
      if (!map.getLayer("aim-solid-halo")) {
        map.addLayer({
          id: "aim-solid-halo",
          type: "line",
          source: "aim-solid",
          paint: {
            "line-color": "#ffffff",
            "line-opacity": 0.55,
            "line-width": 6,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }
      // Solid player->aim. Bright + thick like the static version.
      if (!map.getLayer("aim-solid")) {
        map.addLayer({
          id: "aim-solid",
          type: "line",
          source: "aim-solid",
          paint: {
            "line-color": "#34d399",
            "line-opacity": 1,
            "line-width": 4,
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }
      // Dashed aim->pin. Quieter than the solid; gives a sense of
      // the remaining play distance after the aim.
      if (!map.getLayer("aim-dashed")) {
        map.addLayer({
          id: "aim-dashed",
          type: "line",
          source: "aim-dashed",
          paint: {
            "line-color": "#34d399",
            "line-opacity": 0.55,
            "line-width": 2,
            "line-dasharray": [2, 3],
          },
          layout: { "line-cap": "round", "line-join": "round" },
        });
      }
      // Solid green dot at the aim location -- the visible "pin"
      // that anchors the AIM SET state. Without this the user can't
      // see exactly where they tapped, only the rings and lines
      // around it.
      if (!map.getLayer("aim-dot")) {
        map.addLayer({
          id: "aim-dot",
          type: "circle",
          source: "aim-point",
          paint: {
            "circle-radius": 7,
            "circle-color": "#34d399",
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 2,
          },
        });
      }
      // Inner + outer aim rings. Constant pixel radii so they don't
      // dominate when the user zooms in. Color set via rgba so Mapbox
      // doesn't interpret "transparent" oddly across browsers.
      if (!map.getLayer("aim-ring-inner")) {
        map.addLayer({
          id: "aim-ring-inner",
          type: "circle",
          source: "aim-point",
          paint: {
            "circle-radius": 22,
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#34d399",
            "circle-stroke-opacity": 0.6,
            "circle-stroke-width": 2,
          },
        });
      }
      if (!map.getLayer("aim-ring-outer")) {
        map.addLayer({
          id: "aim-ring-outer",
          type: "circle",
          source: "aim-point",
          paint: {
            "circle-radius": 32,
            "circle-color": "rgba(0,0,0,0)",
            "circle-stroke-color": "#34d399",
            "circle-stroke-opacity": 0.3,
            "circle-stroke-width": 1.5,
          },
        });
      }
    };
    if (map.isStyleLoaded()) {
      apply();
    } else {
      map.once("style.load", apply);
    }
  }, [aim, player, greenCenter]);

  // Yardage pills as HTML markers, with hazard-style pills declustered
  // when they overlap on screen. Re-runs on landmark changes + on
  // zoomend so the cluster threshold (measured in visual pixels)
  // adapts as the user zooms. Pan doesn't change relative pixel
  // distances between two lat/lng points so we don't need to listen
  // to it.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const apply = () => {
      // Clean up any landmark markers from a prior render.
      for (const [id, m] of markersRef.current.entries()) {
        if (id.startsWith("lm-") || id.startsWith("cl-")) {
          m.remove();
          markersRef.current.delete(id);
        }
      }
      if (!landmarks || landmarks.length === 0) return;

      // Hazard pills (id starts with hz- or variant === "tiny") cluster
      // when their on-screen centers fall within ~85 visual pixels of
      // each other. Pin/AIM/F/B (navigational) always render solo so
      // the most important markers can't end up hidden in a cluster.
      const VISUAL_OVERLAP_PX = 85;
      const isHazard = (l: Landmark) =>
        l.id.startsWith("hz-") || l.variant === "tiny";
      const hazardItems = landmarks
        .filter(isHazard)
        .map((l) => ({ l, p: map.project([l.lng, l.lat]) }));
      const navItems = landmarks.filter((l) => !isHazard(l));

      type Cluster = {
        members: { l: Landmark; p: mapboxgl.Point }[];
      };
      const clusters: Cluster[] = [];
      const assigned = new Set<number>();
      for (let i = 0; i < hazardItems.length; i++) {
        if (assigned.has(i)) continue;
        const seed = hazardItems[i];
        const members = [seed];
        assigned.add(i);
        for (let j = i + 1; j < hazardItems.length; j++) {
          if (assigned.has(j)) continue;
          const other = hazardItems[j];
          const d = Math.hypot(
            seed.p.x - other.p.x,
            seed.p.y - other.p.y,
          );
          if (d < VISUAL_OVERLAP_PX) {
            members.push(other);
            assigned.add(j);
          }
        }
        clusters.push({ members });
      }

      // Navigational landmarks render solo.
      for (const l of navItems) {
        const el = buildLandmarkEl(l);
        const m = new mapboxgl.Marker({
          element: el,
          anchor: l.orientation === "below" ? "top" : "bottom",
        })
          .setLngLat([l.lng, l.lat])
          .addTo(map);
        markersRef.current.set(`lm-${l.id}`, m);
      }
      // Hazard clusters: single -> solo, multi -> cluster chip.
      for (const c of clusters) {
        if (c.members.length === 1) {
          const l = c.members[0].l;
          const el = buildLandmarkEl(l);
          const m = new mapboxgl.Marker({
            element: el,
            anchor: l.orientation === "below" ? "top" : "bottom",
          })
            .setLngLat([l.lng, l.lat])
            .addTo(map);
          markersRef.current.set(`lm-${l.id}`, m);
          continue;
        }
        const sorted = [...c.members].sort(
          (a, b) => a.l.yds - b.l.yds,
        );
        const nearest = sorted[0].l;
        // Dominant prefix wins; default to nearest's prefix.
        const counts = new Map<string, number>();
        for (const { l } of c.members) {
          const p = l.prefix ?? "";
          counts.set(p, (counts.get(p) ?? 0) + 1);
        }
        let dominantPrefix = nearest.prefix ?? "";
        let dominantCount = 0;
        for (const [p, n] of counts.entries()) {
          if (n > dominantCount) {
            dominantPrefix = p;
            dominantCount = n;
          }
        }
        // Centroid lat/lng so the cluster pill lands in the middle
        // of the pile rather than on one specific bunker.
        const cx = c.members.reduce((s, m) => s + m.l.lng, 0) / c.members.length;
        const cy = c.members.reduce((s, m) => s + m.l.lat, 0) / c.members.length;
        const el = buildClusterEl({
          prefix: dominantPrefix,
          yds: nearest.yds,
          extra: c.members.length - 1,
          tone: nearest.tone ?? "white",
          dim: c.members.every((m) => m.l.dim),
        });
        const m = new mapboxgl.Marker({
          element: el,
          anchor: "bottom",
        })
          .setLngLat([cx, cy])
          .addTo(map);
        markersRef.current.set(
          `cl-${c.members.map((m) => m.l.id).join(":")}`,
          m,
        );
      }
    };

    const onReady = () => {
      apply();
      // Re-cluster on zoom -- pan keeps relative pixel distances
      // constant for short distances so it's safe to skip.
      map.on("zoomend", apply);
    };

    if (map.isStyleLoaded()) {
      onReady();
    } else {
      map.once("style.load", onReady);
    }
    return () => {
      try {
        map.off("zoomend", apply);
      } catch {
        // Map may already be torn down; safe to ignore.
      }
    };
  }, [landmarks]);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 w-full h-full"
      style={{ cursor: onAim ? "crosshair" : undefined }}
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

// Cluster pill rendered when multiple hazard pills overlap on screen.
// Shows the closest distance and a "+N" badge so the user knows the
// pile size at a glance. Same anchor convention as a single hazard
// pill (tail-bottom, anchor "bottom").
function buildClusterEl({
  prefix,
  yds,
  extra,
  tone,
  dim,
}: {
  prefix: string;
  yds: number;
  extra: number;
  tone: Landmark["tone"];
  dim: boolean;
}): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "filter:drop-shadow(0 4px 8px rgba(0,0,0,0.5));" +
    "pointer-events:none;font-family:ui-monospace,monospace;" +
    (dim ? "opacity:0.5;" : "");

  const bodyBg =
    tone === "sand"
      ? "background:rgba(255,255,255,0.95);color:#3a2d10;"
      : tone === "water"
        ? "background:rgba(255,255,255,0.95);color:#0d2b48;"
        : "background:#ffffff;color:#0b0f0c;";
  const prefixColor =
    tone === "sand"
      ? "color:#8a7a4f;"
      : tone === "water"
        ? "color:#5d80a8;"
        : "color:#6b7c75;";

  const body = document.createElement("div");
  body.style.cssText =
    "display:inline-flex;align-items:center;gap:4px;" +
    "font-variant-numeric:tabular-nums;font-weight:600;" +
    "padding:3px 8px;font-size:12px;border-radius:8px;" +
    bodyBg;

  if (prefix) {
    const px = document.createElement("span");
    px.style.cssText =
      "text-transform:uppercase;font-weight:500;" +
      "letter-spacing:0.14em;font-size:8px;" +
      prefixColor;
    px.textContent = prefix;
    body.appendChild(px);
  }
  body.appendChild(document.createTextNode(String(Math.round(yds))));
  const unit = document.createElement("span");
  unit.style.cssText = "font-weight:500;font-size:9px;" + prefixColor;
  unit.textContent = "y";
  body.appendChild(unit);
  const badge = document.createElement("span");
  badge.style.cssText =
    "margin-left:2px;display:inline-flex;align-items:center;" +
    "justify-content:center;border-radius:9999px;" +
    "background:rgba(0,0,0,0.85);color:#ffffff;" +
    "font-size:9px;font-weight:600;" +
    "padding:1px 6px;min-width:18px;";
  badge.textContent = `+${extra}`;
  body.appendChild(badge);

  const tail = document.createElement("div");
  tail.style.cssText =
    "margin:0 auto;width:0;height:0;" +
    "border-left:4px solid transparent;border-right:4px solid transparent;" +
    "border-top:5px solid #ffffff;margin-top:-1px;";

  wrap.appendChild(body);
  wrap.appendChild(tail);
  return wrap;
}
