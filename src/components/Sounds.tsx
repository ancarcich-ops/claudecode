"use client";

import { useEffect } from "react";

// Opt-in soft sound effects via WebAudio. No external assets -- short
// synthesized tones built at runtime. Off by default; users enable via
// the settings toggle. The brand voice asks for "numbers first, fluff
// last" so this is the only place where audio is used.
//
// Listening events on window:
//   sticks:sound:click        -- small tap
//   sticks:sound:score        -- mid pop, like a putt drop
//   sticks:sound:win          -- a tiny ascending arpeggio
//
// Toggle:
//   localStorage 'sticks.sound' = '1' | '0'  (default: '0')

let audio: AudioContext | null = null;
function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audio) return audio;
  try {
    const AC = (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext) as typeof AudioContext;
    audio = new AC();
    return audio;
  } catch {
    return null;
  }
}

function tone(freq: number, durMs: number, when = 0, gain = 0.06) {
  const c = ctx();
  if (!c) return;
  const t0 = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.frequency.value = freq;
  osc.type = "sine";
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + durMs / 1000);
  osc.connect(g);
  g.connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + durMs / 1000);
}

function enabled(): boolean {
  try {
    return localStorage.getItem("sticks.sound") === "1";
  } catch {
    return false;
  }
}

export default function Sounds() {
  useEffect(() => {
    const onClick = () => {
      if (!enabled()) return;
      tone(880, 60);
    };
    const onScore = () => {
      if (!enabled()) return;
      tone(660, 90, 0);
      tone(990, 110, 0.04);
    };
    const onWin = () => {
      if (!enabled()) return;
      tone(523, 80, 0);
      tone(659, 80, 0.08);
      tone(784, 80, 0.16);
      tone(1047, 160, 0.24);
    };
    window.addEventListener("sticks:sound:click", onClick);
    window.addEventListener("sticks:sound:score", onScore);
    window.addEventListener("sticks:sound:win", onWin);
    return () => {
      window.removeEventListener("sticks:sound:click", onClick);
      window.removeEventListener("sticks:sound:score", onScore);
      window.removeEventListener("sticks:sound:win", onWin);
    };
  }, []);
  return null;
}

// Standalone toggle UI -- drop into Settings or the dropdown menu.
export function SoundsToggle() {
  // Local state mirrors localStorage so the switch reflects current state
  // on mount.
  const onToggle = () => {
    try {
      const cur = localStorage.getItem("sticks.sound") === "1";
      localStorage.setItem("sticks.sound", cur ? "0" : "1");
      // Play a click on enable so the user gets immediate feedback.
      if (!cur) tone(880, 60);
    } catch {}
  };
  return (
    <button
      type="button"
      onClick={onToggle}
      className="text-xs text-mute hover:text-ink"
    >
      Toggle sounds
    </button>
  );
}
