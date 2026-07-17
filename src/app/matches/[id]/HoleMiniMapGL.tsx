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

// Colour tune for the satellite basemap. Mapbox's raw imagery reads a
// touch flat and desaturated -- turf especially -- so a modest
// saturation + contrast lift makes fairways greener and edges crisper.
// Kept deliberately mild: over-saturating low-res tiles just amplifies
// JPEG noise. Range for both is -1..1 (0 = untouched). Applied to
// whatever raster layer the style ships, so it survives a future
// swap of the underlying imagery source.
const IMAGERY_TUNE = { saturation: 0.3, contrast: 0.15 } as const;

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

// Standard ray-casting point-in-polygon over a lat/lng ring. Coords
// are flat numbers, no projection needed at the scales we care about
// (a single green ~30 yds across). Returns true when (lat, lng) is
// inside the polygon, used to suppress hazard pills that would sit
// on top of the green.
function pointInLatLngPolygon(
  lat: number,
  lng: number,
  ring: { lat: number; lng: number }[],
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng;
    const yi = ring[i].lat;
    const xj = ring[j].lng;
    const yj = ring[j].lat;
    const intersects =
      yi > lat !== yj > lat &&
      lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

// Initial-bearing (degrees clockwise from north) for the great-circle
// path from `from` to `to`. We use it to rotate the map so the hole
// "plays up" -- the tee sits at the bottom of the screen and the
// green is at the top regardless of which way the hole runs. Stable
// enough for the ~400-yard distances we care about; no ellipsoidal
// correction needed.
function bearingDeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const phi1 = toRad(from.lat);
  const phi2 = toRad(to.lat);
  const dLng = toRad(to.lng - from.lng);
  const y = Math.sin(dLng) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

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
  chromeBottomPx = 40,
  chromeTopPx = 40,
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
  // Chrome insets (pixels of obscured screen at top / bottom). Drive
  // the fitBounds padding so the tee + green don't sit under the
  // header band or the bottom distance panel.
  chromeBottomPx?: number;
  chromeTopPx?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  // SVG overlay we drive imperatively to render the bold player->aim
  // play line. GL JS line layers were inconsistent on some devices --
  // an SVG <line> drawn over the container with pixel coords from
  // map.project() is dead reliable, updates 1:1 with the camera, and
  // gives full styling control (width, halo, dashing).
  const lineSvgRef = useRef<SVGSVGElement>(null);
  const lineHaloRef = useRef<SVGLineElement>(null);
  const lineSolidRef = useRef<SVGLineElement>(null);
  // Second pair of <line>s for the aim->pin dashed continuation.
  // Same imperative approach as the solid play line.
  const lineDashedHaloRef = useRef<SVGLineElement>(null);
  const lineDashedRef = useRef<SVGLineElement>(null);
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

  // Hole bbox -- static geometry of the hole itself. Player position
  // and dynamic landmarks (AIM, distance pills) are intentionally
  // EXCLUDED so the camera doesn't re-fit every time the GPS ticks
  // or the user taps a new aim point. The fit happens once per hole
  // (see the effect below); player + AIM render as their own markers
  // and stay visible wherever they land within the fitted view.
  const bbox = useMemo(() => {
    const pts: Pt[] = [];
    if (tee) pts.push(tee);
    if (greenCenter) pts.push(greenCenter);
    if (greenFront) pts.push(greenFront);
    if (greenBack) pts.push(greenBack);
    if (greenPolygon) for (const p of greenPolygon) pts.push(p);
    for (const h of hazards) pts.push(h);
    if (pts.length === 0) return null;
    const lats = pts.map((p) => p.lat);
    const lngs = pts.map((p) => p.lng);
    return {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLng: Math.min(...lngs),
      maxLng: Math.max(...lngs),
    };
  }, [tee, greenCenter, greenFront, greenBack, greenPolygon, hazards]);

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
      // Pitch stays locked at 0 -- a tilted satellite view is mostly
      // glamour, not useful for shot-planning. Bearing (rotation) IS
      // user-controllable: the bbox-fit effect initially rotates the
      // hole "tee down, green up", but the player can two-finger twist
      // to override for awkward holes where the auto-bearing isn't
      // ideal (e.g. doglegs, holes where the DB has no tee marker so
      // bearing falls back to north-up).
      pitch: 0,
      bearing: 0,
      dragRotate: true,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: false,
    });
    // touchZoomRotate stays fully enabled (two-finger twist rotates).
    // Previous build called .disableRotation() here; removed so the
    // user can override the auto-bearing on the on-course view.


    // Tap-to-aim. The map gives us lngLat directly -- no projection
    // math like the static path needed -- so we just hand the coord
    // up. Crosshair cursor on the container signals tappability on
    // desktop; on touch it's invisible but harmless.
    map.on("click", (e) => {
      const cb = onAimRef.current;
      if (!cb) return;
      cb({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    });

    // Punch up the imagery once the style's raster layer exists. We
    // find it by type rather than hard-coding "satellite" so this keeps
    // working if the source is ever swapped (Esri, etc.).
    map.on("style.load", () => {
      for (const layer of map.getStyle()?.layers ?? []) {
        if (layer.type === "raster") {
          map.setPaintProperty(layer.id, "raster-saturation", IMAGERY_TUNE.saturation);
          map.setPaintProperty(layer.id, "raster-contrast", IMAGERY_TUNE.contrast);
        }
      }
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

  // Fit ONCE per hole. The previous version re-ran on every bbox
  // change, but bbox depended on player + landmarks + aim, so every
  // GPS tick and every aim tap snapped the camera back to the fit --
  // a manual pinch-zoom got undone immediately and the view felt
  // "stuck" zoomed in whenever the player marker drifted close to
  // the tee/green anchors. Now we key the fit on the hole's static
  // anchors (tee + green center) and skip the call if we've already
  // fitted that exact hole.
  const lastFitKeyRef = useRef<string>("");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !bbox) return;
    // Stable identifier for "this is the same hole as last time".
    // tee + greenCenter alone are enough -- per-hole geometry below
    // them (front/back/polygon/hazards) is keyed off the same hole.
    const key = `${tee?.lat},${tee?.lng}|${greenCenter?.lat},${greenCenter?.lng}`;
    if (key === lastFitKeyRef.current) return;
    lastFitKeyRef.current = key;
    // Rotate the map so the hole always "plays up": tee at the bottom
    // of the screen, green toward the top. fitBounds resets bearing
    // to 0 unless one is passed in.
    const holeBearing =
      tee && greenCenter ? bearingDeg(tee, greenCenter) : 0;
    map.fitBounds(
      [
        [bbox.minLng, bbox.minLat],
        [bbox.maxLng, bbox.maxLat],
      ],
      {
        padding: {
          top: chromeTopPx,
          bottom: chromeBottomPx,
          left: 40,
          right: 40,
        },
        duration: 0,
        maxZoom: 19,
        bearing: holeBearing,
      },
    );
  }, [bbox, tee, greenCenter, chromeBottomPx, chromeTopPx]);

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

      // Aim point indicator. Rendered as an HTML marker so it's
      // guaranteed visible regardless of any GL JS layer-stack
      // quirks: a solid green dot with two concentric ring outlines
      // for the dispersion guides. Replaces the aim-dot / aim-ring-*
      // GL layers from PR #299 that some users reported missing
      // entirely on certain devices.
      upsertMarker("aim-dot", aim ?? null, () => {
        const el = document.createElement("div");
        el.style.cssText =
          "position:relative;width:64px;height:64px;" +
          "display:flex;align-items:center;justify-content:center;" +
          "pointer-events:none;";
        // Outer ring (faint, larger)
        const outer = document.createElement("div");
        outer.style.cssText =
          "position:absolute;inset:6px;border-radius:50%;" +
          "border:1.5px solid rgba(52,211,153,0.35);";
        el.appendChild(outer);
        // Inner ring (tighter, bolder)
        const inner = document.createElement("div");
        inner.style.cssText =
          "position:absolute;inset:14px;border-radius:50%;" +
          "border:2px solid rgba(52,211,153,0.7);";
        el.appendChild(inner);
        // Solid dot at the center -- this is the "aim point" anchor.
        const dot = document.createElement("div");
        dot.style.cssText =
          "position:relative;width:14px;height:14px;border-radius:50%;" +
          "background:#34d399;border:2px solid #ffffff;" +
          "box-shadow:0 1px 4px rgba(0,0,0,0.5);";
        el.appendChild(dot);
        el.setAttribute("aria-label", "Aim point");
        return el;
      });
    };
    if (map.isStyleLoaded()) {
      onReady();
    } else {
      map.once("style.load", onReady);
    }
  }, [tee, greenCenter, greenFront, greenBack, player, greenPolygon, hazards, aim]);

  // SVG overlay driver for the aim play lines. We keep the GL JS
  // line layers below as a fallback, but the SVG lines are what the
  // user actually sees -- bright, halo'd, always paint. Two pairs:
  // (halo + solid) for player->aim, and (halo + dashed) for the
  // aim->pin continuation.
  useEffect(() => {
    const map = mapRef.current;
    const halo = lineHaloRef.current;
    const solid = lineSolidRef.current;
    const dashedHalo = lineDashedHaloRef.current;
    const dashed = lineDashedRef.current;
    if (!map || !halo || !solid || !dashedHalo || !dashed) return;

    const drawLine = (
      el: SVGLineElement,
      a: { x: number; y: number },
      b: { x: number; y: number },
    ) => {
      el.setAttribute("x1", String(a.x));
      el.setAttribute("y1", String(a.y));
      el.setAttribute("x2", String(b.x));
      el.setAttribute("y2", String(b.y));
      el.style.display = "";
    };

    const update = () => {
      // Player->aim play line.
      if (aim && player) {
        const a = map.project([player.lng, player.lat]);
        const b = map.project([aim.lng, aim.lat]);
        drawLine(halo, a, b);
        drawLine(solid, a, b);
      } else {
        halo.style.display = "none";
        solid.style.display = "none";
      }
      // Aim->pin continuation. Lights up the rest of the play after
      // the aim point so the line "completes" at the hole.
      if (aim && greenCenter) {
        const a = map.project([aim.lng, aim.lat]);
        const b = map.project([greenCenter.lng, greenCenter.lat]);
        drawLine(dashedHalo, a, b);
        drawLine(dashed, a, b);
      } else {
        dashedHalo.style.display = "none";
        dashed.style.display = "none";
      }
    };

    update();
    map.on("move", update);
    map.on("zoom", update);
    return () => {
      map.off("move", update);
      map.off("zoom", update);
    };
  }, [aim, player, greenCenter]);

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
      // Clean up any landmark markers from a prior render. Materialize
      // the keys first so we don't mutate the Map while iterating it
      // (subtle but real cause of skipped deletes).
      const staleKeys: string[] = [];
      for (const id of markersRef.current.keys()) {
        if (id.startsWith("lm-") || id.startsWith("cl-")) staleKeys.push(id);
      }
      for (const id of staleKeys) {
        const m = markersRef.current.get(id);
        if (m) m.remove();
        markersRef.current.delete(id);
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
      // Project nav items once -- used both for rendering and for
      // suppressing hazard pills that would collide with PIN / AIM /
      // Front / Back labels.
      const navProjected = navItems.map((l) => ({
        l,
        p: map.project([l.lng, l.lat]),
      }));

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
      // Drop any hazard cluster whose label would visually collide
      // with a nav landmark (PIN / AIM / Front / Back / Center) OR
      // sit on top of the green polygon. Nav labels carry shot-
      // planning info; the bunker is still visible on the satellite
      // + as a colored marker, the pill is just the distance
      // annotation, and burying the green under a BNK label is
      // worse than dropping the label.
      const visibleClusters = clusters.filter((c) => {
        const cx = c.members.reduce((s, m) => s + m.p.x, 0) / c.members.length;
        const cy = c.members.reduce((s, m) => s + m.p.y, 0) / c.members.length;
        for (const nav of navProjected) {
          const d = Math.hypot(cx - nav.p.x, cy - nav.p.y);
          if (d < VISUAL_OVERLAP_PX) return false;
        }
        if (greenPolygon && greenPolygon.length >= 3) {
          const cLat = c.members.reduce((s, m) => s + m.l.lat, 0) / c.members.length;
          const cLng = c.members.reduce((s, m) => s + m.l.lng, 0) / c.members.length;
          if (pointInLatLngPolygon(cLat, cLng, greenPolygon)) return false;
        }
        return true;
      });

      // Hazard clusters: single -> solo, multi -> cluster chip.
      for (const c of visibleClusters) {
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

    // HTML markers don't depend on the GL style being loaded -- they
    // get appended to the map's container as DOM nodes. Earlier we
    // gated this on map.isStyleLoaded() and deferred to a once
    // "style.load" listener when it wasn't ready, but that listener
    // never fires on re-renders (style only loads once per map
    // instance) so the cleanup + re-render of landmark markers was
    // silently skipped on hole switches -- leaving the previous
    // hole's BNK / PIN pills frozen on screen. Always call onReady
    // directly; mapboxgl.Marker.addTo works regardless of style.
    onReady();
    return () => {
      try {
        map.off("zoomend", apply);
      } catch {
        // Map may already be torn down; safe to ignore.
      }
    };
  }, [landmarks, greenPolygon]);

  return (
    <>
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full"
        style={{ cursor: onAim ? "crosshair" : undefined }}
      />
      {/* SVG overlay for the play lines. Lives above the map canvas
          but below the HTML markers (player, aim dot, pills) since
          markers get appended to the container later by GL JS.
          pointer-events:none so it doesn't eat taps. */}
      <svg
        ref={lineSvgRef}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 1 }}
      >
        {/* Player -> aim: solid green with a subtle white halo. */}
        <line
          ref={lineHaloRef}
          stroke="#ffffff"
          strokeOpacity="0.4"
          strokeWidth="4"
          strokeLinecap="round"
          style={{ display: "none" }}
        />
        <line
          ref={lineSolidRef}
          stroke="#34d399"
          strokeWidth="2.5"
          strokeLinecap="round"
          style={{ display: "none" }}
        />
        {/* Aim -> pin: dashed green, slightly quieter than the
            solid, with its own halo so it stays legible. */}
        <line
          ref={lineDashedHaloRef}
          stroke="#ffffff"
          strokeOpacity="0.3"
          strokeWidth="4"
          strokeLinecap="round"
          style={{ display: "none" }}
        />
        <line
          ref={lineDashedRef}
          stroke="#34d399"
          strokeOpacity="0.8"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray="6 5"
          style={{ display: "none" }}
        />
      </svg>
    </>
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
