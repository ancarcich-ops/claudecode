// Camera flight math for the 3D hole preview. Given a hole's tee and
// green coordinates, build a small set of cinematic keyframes that fly
// the camera from a high establishing shot, down behind the tee, along
// the fairway midline, then settle behind the green looking back. Each
// keyframe is a deck.gl Map view state (longitude / latitude / zoom /
// pitch / bearing); the renderer interpolates between them on a timer.
//
// Coordinates are WGS84 lat/lng. Bearings are compass degrees (0 = N,
// 90 = E). Distances are meters.

export type HoleEndpoints = {
  teeLat: number;
  teeLng: number;
  greenLat: number;
  greenLng: number;
};

export type CameraKeyframe = {
  // Map-anchored view: which lng/lat the camera is pointing at.
  longitude: number;
  latitude: number;
  // deck.gl zoom (higher = closer). 17 ~ city block, 19 ~ a few houses,
  // 20 ~ a single building roof.
  zoom: number;
  // Tilt off the vertical axis. 0 = top-down, 60 = standard drone angle,
  // 80 = nearly horizon-level.
  pitch: number;
  // Compass bearing the camera is FACING. Map rotates so this direction
  // points up the screen.
  bearing: number;
  // Milliseconds the camera should take to ease into THIS keyframe from
  // the previous one. First keyframe's transitionDuration is ignored
  // (it's the starting pose, not a transition).
  transitionDuration: number;
};

// Compass bearing from A to B in degrees [0, 360).
export function bearingDegrees(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);
  const dLng = toRad(bLng - aLng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

// Linear interpolation in lat/lng space. Good enough at hole-length
// distances (sub-km); no need for great-circle math here.
function lerpLatLng(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
  t: number,
): { lat: number; lng: number } {
  return {
    lat: aLat + (bLat - aLat) * t,
    lng: aLng + (bLng - aLng) * t,
  };
}

// Cinematic intro fly-through for a single hole:
//   1. Establishing shot from above the tee, looking down the fairway.
//   2. Descend to camera height ~80m behind the tee.
//   3. Glide along the fairway centerline to the green.
//   4. Settle behind the green, looking back at the tee.
//
// The renderer plays these keyframes in order, then hands gestures to
// the user.
export function flightPathFor(hole: HoleEndpoints): CameraKeyframe[] {
  const teeToGreen = bearingDegrees(
    hole.teeLat,
    hole.teeLng,
    hole.greenLat,
    hole.greenLng,
  );
  const greenToTee = (teeToGreen + 180) % 360;

  const tee = { lat: hole.teeLat, lng: hole.teeLng };
  const green = { lat: hole.greenLat, lng: hole.greenLng };
  const mid = lerpLatLng(tee.lat, tee.lng, green.lat, green.lng, 0.5);

  // Anchor the establishing shot slightly behind the tee so the whole
  // hole is visible in frame.
  const behindTee = lerpLatLng(green.lat, green.lng, tee.lat, tee.lng, 1.04);
  // Anchor the settle shot slightly past the green for the same reason.
  const pastGreen = lerpLatLng(tee.lat, tee.lng, green.lat, green.lng, 1.04);

  return [
    // 1. Establishing shot, high tilt, looking down the hole.
    {
      longitude: behindTee.lng,
      latitude: behindTee.lat,
      zoom: 16.5,
      pitch: 45,
      bearing: teeToGreen,
      transitionDuration: 0, // starting pose
    },
    // 2. Descend behind the tee.
    {
      longitude: behindTee.lng,
      latitude: behindTee.lat,
      zoom: 18.4,
      pitch: 70,
      bearing: teeToGreen,
      transitionDuration: 2600,
    },
    // 3. Glide to mid-fairway, slightly higher angle (sees more of green).
    {
      longitude: mid.lng,
      latitude: mid.lat,
      zoom: 18.2,
      pitch: 68,
      bearing: teeToGreen,
      transitionDuration: 3800,
    },
    // 4. Past the green, looking back. Pitch a touch lower so the tee
    //    and fairway both stay in frame.
    {
      longitude: pastGreen.lng,
      latitude: pastGreen.lat,
      zoom: 17.8,
      pitch: 62,
      bearing: greenToTee,
      transitionDuration: 3000,
    },
  ];
}
