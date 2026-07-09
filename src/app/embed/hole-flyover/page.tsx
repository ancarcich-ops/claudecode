// GET /embed/hole-flyover?teeLat=..&teeLng=..&greenLat=..&greenLng=..
//   &n=7&par=4&yards=410&hud=0
//
// A chrome-less, unauthenticated page that renders the photorealistic
// 3D flyover for ONE hole, sized to fill a WebView. Fed purely by
// coordinates in the query string (no session, no secrets) so the iOS
// on-course GPS "3D" mode can build the URL from the holeGeo it
// already has and load it in a WKWebView. Mirrors the web's 3D toggle
// (same HolePreview3D + Google 3D Tiles), which native MapKit can't
// reproduce for golf courses.

import type { Metadata } from "next";
import FlyoverClient from "./FlyoverClient";

export const dynamic = "force-dynamic";

// Let the flyover own the full WebView surface, edge to edge.
export const metadata: Metadata = {
  viewport:
    "width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=1, user-scalable=no",
};

function num(v: string | string[] | undefined): number | null {
  if (typeof v !== "string") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export default function HoleFlyoverEmbed({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const teeLat = num(searchParams.teeLat);
  const teeLng = num(searchParams.teeLng);
  const greenLat = num(searchParams.greenLat);
  const greenLng = num(searchParams.greenLng);

  // Without both endpoints there's no hole to fly. Show a quiet,
  // dark placeholder rather than a broken canvas.
  if (
    teeLat === null ||
    teeLng === null ||
    greenLat === null ||
    greenLng === null
  ) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 99999,
          background: "#0b0f0d",
          color: "#EDE7DB",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          font: "500 13px/1.4 system-ui, sans-serif",
          textAlign: "center",
          padding: 24,
        }}
      >
        No 3D map for this hole yet.
      </div>
    );
  }

  const number = num(searchParams.n) ?? undefined;
  const par = num(searchParams.par) ?? undefined;
  const yards = num(searchParams.yards) ?? undefined;
  const showHud = searchParams.hud === "1";

  return (
    <FlyoverClient
      hole={{
        teeLat,
        teeLng,
        greenLat,
        greenLng,
        number: number,
        par: par,
        yards: yards,
      }}
      showHud={showHud}
    />
  );
}
