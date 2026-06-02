"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";

// TODO(map-rewrite): This component CSS-scales the entire map view as a
// quick way to get pinch zoom on a static Mapbox satellite image + SVG
// overlays. It works fine up to ~2x but the underlying image is fixed
// resolution so it pixelates past that. The long-term plan is to swap
// HoleMiniMap to Mapbox GL JS (vector tiles, native pinch/pan with
// re-anchoring overlays), at which point this component can be
// retired.

type Props = {
  children: React.ReactNode;
  // Min/max zoom factors. Past 4x the underlying static satellite
  // image gets fuzzy enough that there's no benefit to zooming further.
  min?: number;
  max?: number;
  // Optional className for the outer container; pinch handlers live on
  // it. The default fills its parent (absolute inset-0).
  className?: string;
};

export type PinchZoomHandle = {
  // Pan + zoom so the point at (fx, fy) -- fractions of the container's
  // width/height in [0,1] -- ends up centered, at the requested scale.
  // Used by HoleMiniMap's "Tee / Mid / Green" preset chips.
  zoomToFraction: (fx: number, fy: number, targetScale: number) => void;
  // Snap back to scale=1, tx=ty=0.
  reset: () => void;
};

const PinchZoom = forwardRef<PinchZoomHandle, Props>(function PinchZoom(
  {
    children,
    min = 1,
    max = 4,
    className = "absolute inset-0 w-full h-full overflow-hidden touch-none",
  },
  ref,
) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  // Animated transitions on button / double-tap / preset triggers
  // (where we jump rather than drag). Set to false during in-flight
  // touch gestures so finger drags stay 1:1.
  const [animating, setAnimating] = useState(false);

  // Refs (not state) for in-flight gesture so we don't fight React
  // batching on every frame.
  const gesture = useRef<
    | null
    | {
        kind: "pinch";
        startDist: number;
        startScale: number;
        startTx: number;
        startTy: number;
        // Pinch midpoint, in viewport coords, at gesture start.
        midX: number;
        midY: number;
      }
    | {
        kind: "pan";
        startX: number;
        startY: number;
        startTx: number;
        startTy: number;
      }
  >(null);

  // Track the last tap so double-tap detection can fire. Stored as a
  // ref to dodge re-renders for what's purely a gesture flag.
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null);

  // Clamp the translate so the scaled content always covers the
  // viewport. With scale S, the content extends (S-1)*W/2 beyond
  // either edge from the center; that's the absolute pan budget on
  // each axis.
  const clamp = (s: number, x: number, y: number) => {
    const el = outerRef.current;
    if (!el) return { x, y };
    const w = el.clientWidth;
    const h = el.clientHeight;
    const maxX = ((s - 1) * w) / 2;
    const maxY = ((s - 1) * h) / 2;
    return {
      x: Math.max(-maxX, Math.min(maxX, x)),
      y: Math.max(-maxY, Math.min(maxY, y)),
    };
  };

  // Zoom in/out anchored on a container-relative point (cx, cy)
  // measured from the element's center. Used by both +/- buttons
  // (cx=cy=0) and double-tap (cx, cy from the tap location).
  const zoomTo = (target: number, cx: number, cy: number) => {
    const next = Math.max(min, Math.min(max, target));
    if (next === scale) return;
    // Translate so the chosen anchor point stays under the user's
    // finger / cursor: see math in onTouchMove pinch branch.
    const k = next / scale - 1;
    const c = clamp(next, tx - cx * k, ty - cy * k);
    setAnimating(true);
    setScale(next);
    setTx(c.x);
    setTy(c.y);
  };

  useImperativeHandle(ref, () => ({
    zoomToFraction(fx, fy, target) {
      const el = outerRef.current;
      if (!el) return;
      const w = el.clientWidth;
      const h = el.clientHeight;
      const next = Math.max(min, Math.min(max, target));
      // (fx, fy) addresses a point in the unscaled content as a
      // fraction of the container; we want that point centered after
      // the scale lands. Container-center origin means the offset is
      // (fx-0.5)*w from center; to bring it to (0,0) at scale `next`
      // we translate by -next * offset.
      const cx = (fx - 0.5) * w;
      const cy = (fy - 0.5) * h;
      const c = clamp(next, -next * cx, -next * cy);
      setAnimating(true);
      setScale(next);
      setTx(c.x);
      setTy(c.y);
    },
    reset() {
      setAnimating(true);
      setScale(1);
      setTx(0);
      setTy(0);
    },
  }));

  useEffect(() => {
    const el = outerRef.current;
    if (!el) return;

    const dist = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onTouchStart = (e: TouchEvent) => {
      // Any active touch kills an animation so the gesture feels
      // immediate -- otherwise the in-flight transition fights the
      // finger.
      setAnimating(false);
      if (e.touches.length === 2) {
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const rect = el.getBoundingClientRect();
        gesture.current = {
          kind: "pinch",
          startDist: dist(t1, t2),
          startScale: scale,
          startTx: tx,
          startTy: ty,
          // Midpoint relative to the element's center.
          midX:
            (t1.clientX + t2.clientX) / 2 - (rect.left + rect.width / 2),
          midY:
            (t1.clientY + t2.clientY) / 2 - (rect.top + rect.height / 2),
        };
        e.preventDefault();
      } else if (e.touches.length === 1) {
        const t = e.touches[0];
        const rect = el.getBoundingClientRect();
        const cx = t.clientX - (rect.left + rect.width / 2);
        const cy = t.clientY - (rect.top + rect.height / 2);
        const now = Date.now();
        const last = lastTapRef.current;
        // Double-tap: a second touch within 300ms and ~24px of the
        // previous one toggles zoom -- in to 2.5x at the tap point if
        // currently at 1x, back to 1x otherwise.
        if (
          last &&
          now - last.t < 300 &&
          Math.hypot(cx - last.x, cy - last.y) < 24
        ) {
          lastTapRef.current = null;
          if (scale > 1.05) {
            setAnimating(true);
            setScale(1);
            setTx(0);
            setTy(0);
          } else {
            zoomTo(2.5, cx, cy);
          }
          e.preventDefault();
          return;
        }
        lastTapRef.current = { t: now, x: cx, y: cy };
        if (scale > 1) {
          gesture.current = {
            kind: "pan",
            startX: t.clientX,
            startY: t.clientY,
            startTx: tx,
            startTy: ty,
          };
        }
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      const g = gesture.current;
      if (!g) return;
      if (g.kind === "pinch" && e.touches.length === 2) {
        const [t1, t2] = [e.touches[0], e.touches[1]];
        const d = dist(t1, t2);
        const ratio = d / g.startDist;
        const next = Math.max(min, Math.min(max, g.startScale * ratio));
        // Anchor zoom around the original pinch midpoint so the
        // content under the user's fingers stays roughly where it is.
        const k = next / g.startScale - 1;
        const c = clamp(
          next,
          g.startTx - g.midX * k,
          g.startTy - g.midY * k,
        );
        setScale(next);
        setTx(c.x);
        setTy(c.y);
        e.preventDefault();
      } else if (g.kind === "pan" && e.touches.length === 1) {
        const dx = e.touches[0].clientX - g.startX;
        const dy = e.touches[0].clientY - g.startY;
        const c = clamp(scale, g.startTx + dx, g.startTy + dy);
        setTx(c.x);
        setTy(c.y);
        e.preventDefault();
      }
    };

    const onTouchEnd = () => {
      gesture.current = null;
    };

    const onWheel = (e: WheelEvent) => {
      // Trackpad pinches surface as wheel events with ctrlKey set.
      // Plain wheel scrolls are ignored so the page can still scroll.
      if (!e.ctrlKey && Math.abs(e.deltaY) < 8) return;
      const rect = el.getBoundingClientRect();
      const px = e.clientX - (rect.left + rect.width / 2);
      const py = e.clientY - (rect.top + rect.height / 2);
      const factor = Math.exp(-e.deltaY * 0.01);
      const next = Math.max(min, Math.min(max, scale * factor));
      if (next === scale) return;
      const k = next / scale - 1;
      const c = clamp(next, tx - px * k, ty - py * k);
      setAnimating(false);
      setScale(next);
      setTx(c.x);
      setTy(c.y);
      e.preventDefault();
    };

    // Desktop double-click mirrors the touch double-tap behavior.
    const onDoubleClick = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - (rect.left + rect.width / 2);
      const cy = e.clientY - (rect.top + rect.height / 2);
      if (scale > 1.05) {
        setAnimating(true);
        setScale(1);
        setTx(0);
        setTy(0);
      } else {
        zoomTo(2.5, cx, cy);
      }
      e.preventDefault();
    };

    // touchstart needs to be non-passive so preventDefault works.
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd);
    el.addEventListener("touchcancel", onTouchEnd);
    el.addEventListener("wheel", onWheel, { passive: false });
    el.addEventListener("dblclick", onDoubleClick);
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("dblclick", onDoubleClick);
    };
    // zoomTo + clamp close over scale/tx/ty so this needs to refresh
    // on every state change. Cheap -- handlers are tiny.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scale, tx, ty, min, max]);

  const onPlusClick = () => zoomTo(scale * 1.5, 0, 0);
  const onMinusClick = () => zoomTo(scale / 1.5, 0, 0);
  const onResetClick = () => {
    setAnimating(true);
    setScale(1);
    setTx(0);
    setTy(0);
  };

  // Button is "active" (can take a tap) when the scale isn't already
  // pinned to the bound. Lets us dim the icon so users don't bounce
  // off a no-op button at the limits.
  const canZoomIn = scale < max - 0.001;
  const canZoomOut = scale > min + 0.001;

  return (
    <div ref={outerRef} className={className}>
      <div
        className="w-full h-full origin-center will-change-transform"
        style={{
          transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          transition:
            animating && !gesture.current
              ? "transform 220ms cubic-bezier(0.22, 1, 0.36, 1)"
              : "none",
        }}
        onTransitionEnd={() => setAnimating(false)}
      >
        {children}
      </div>
      {/* Zoom chrome: vertical stack of +, -, and a reset chip that
          only appears when zoomed. Positioned where the old single
          chip lived so on-course muscle memory carries over. */}
      <div className="absolute top-2 right-2 z-10 flex flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={onPlusClick}
          disabled={!canZoomIn}
          className={
            "w-8 h-8 rounded-full bg-black/70 text-white text-base leading-none font-mono " +
            "flex items-center justify-center backdrop-blur-sm " +
            (canZoomIn ? "active:bg-black/85" : "opacity-40 cursor-not-allowed")
          }
          aria-label="Zoom in"
        >
          +
        </button>
        <button
          type="button"
          onClick={onMinusClick}
          disabled={!canZoomOut}
          className={
            "w-8 h-8 rounded-full bg-black/70 text-white text-lg leading-none font-mono " +
            "flex items-center justify-center backdrop-blur-sm " +
            (canZoomOut
              ? "active:bg-black/85"
              : "opacity-40 cursor-not-allowed")
          }
          aria-label="Zoom out"
        >
          −
        </button>
        {scale > 1.05 && (
          <button
            type="button"
            onClick={onResetClick}
            className="rounded-full bg-black/70 text-white text-[11px] px-2.5 py-1 font-mono backdrop-blur-sm active:bg-black/85"
            aria-label="Reset zoom"
          >
            {scale.toFixed(1)}×
          </button>
        )}
      </div>
    </div>
  );
});

export default PinchZoom;
