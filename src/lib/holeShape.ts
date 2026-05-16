// Build a small SVG path for the peek-next-hole panel from OSM-derived
// hole geometry. The same equirectangular projection we use in the
// on-course mini-map, but flattened sideways so play runs left to right
// inside a wide-short viewBox (default 100x18).
//
// Inputs are best-effort. If we don't have both a tee and a green
// coordinate the helper returns null so the caller can fall back to the
// generic placeholder curve.

export type LatLng = { lat: number; lng: number };

export function buildHoleShapePath(
  tee: LatLng | null,
  green: LatLng | null,
  fairwayPolygon: LatLng[] | null,
  width: number = 100,
  height: number = 18,
): string | null {
  if (!tee || !green) return null;

  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const ref = tee;
  const cosLat = Math.cos(toRad(ref.lat));
  const project = (p: LatLng) => ({
    x: toRad(p.lng - ref.lng) * R * cosLat,
    y: -toRad(p.lat - ref.lat) * R,
  });

  const teeXY = project(tee);
  const greenXY = project(green);

  // Rotate so tee -> green points along +x. atan2(dy, dx) is the
  // current angle; negate to bring it back to 0.
  const angle = Math.atan2(greenXY.y - teeXY.y, greenXY.x - teeXY.x);
  const cos = Math.cos(-angle);
  const sin = Math.sin(-angle);
  const rotate = (p: { x: number; y: number }) => ({
    x: p.x * cos - p.y * sin,
    y: p.x * sin + p.y * cos,
  });

  // Centerline samples: tee, optional dogleg control point (fairway
  // centroid), then green. The centroid is a rough but cheap stand-in
  // for the actual fairway spine -- good enough at this size.
  const points: { x: number; y: number }[] = [teeXY];
  if (fairwayPolygon && fairwayPolygon.length >= 3) {
    let cx = 0;
    let cy = 0;
    for (const p of fairwayPolygon) {
      const proj = project(p);
      cx += proj.x;
      cy += proj.y;
    }
    cx /= fairwayPolygon.length;
    cy /= fairwayPolygon.length;
    points.push({ x: cx, y: cy });
  }
  points.push(greenXY);
  const rotated = points.map(rotate);

  const xs = rotated.map((p) => p.x);
  const ys = rotated.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const playLen = Math.max(1, maxX - minX);
  const variance = Math.max(0.001, maxY - minY);

  // Fit the play axis to the viewBox width; clamp the perpendicular
  // variance so deep doglegs don't run off the top/bottom but shallow
  // holes still read as gently curved. The 0.6x cap is intentional --
  // a perfectly straight hole shouldn't get vertically exaggerated.
  const padX = 6;
  const padY = 2;
  const scaleX = (width - padX * 2) / playLen;
  const cappedScaleY = Math.min(scaleX, (height - padY * 2) / variance) * 0.95;
  const midY = (minY + maxY) / 2;
  const fit = (p: { x: number; y: number }) => ({
    cx: padX + (p.x - minX) * scaleX,
    cy: height / 2 + (p.y - midY) * cappedScaleY,
  });

  const projected = rotated.map(fit);
  const f = (n: number) => n.toFixed(1);

  if (projected.length === 2) {
    const [a, b] = projected;
    return `M ${f(a.cx)} ${f(a.cy)} L ${f(b.cx)} ${f(b.cy)}`;
  }
  const [a, b, c] = projected;
  return `M ${f(a.cx)} ${f(a.cy)} Q ${f(b.cx)} ${f(b.cy)} ${f(c.cx)} ${f(c.cy)}`;
}
