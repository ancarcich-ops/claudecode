"use client";

import { Component, type ReactNode } from "react";

// TEMP: on-screen error catcher used while we hunt a client-side
// crash on the on-course screen. Shows the actual error + stack trace
// in production where Next.js would normally hide it. Remove this
// component (and its mount points) once the bug is fixed.
//
// Why a class component: React error boundaries can ONLY be class
// components -- there is no functional-component hook equivalent.

type Props = { children: ReactNode };
type State = { error: Error | null; info: string | null };

export default class DebugErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    this.setState({ error, info: info.componentStack ?? null });
  }

  reset = () => this.setState({ error: null, info: null });

  copy = () => {
    const { error, info } = this.state;
    const payload = [
      error?.message ?? "",
      "",
      "STACK:",
      error?.stack ?? "(no stack)",
      "",
      "COMPONENT STACK:",
      info ?? "(no component stack)",
    ].join("\n");
    try {
      navigator.clipboard.writeText(payload);
    } catch {
      // No-op -- some browsers block clipboard from non-secure contexts.
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fixed inset-0 z-[9999] bg-black/95 text-white overflow-auto p-4 font-mono text-[11px] leading-snug">
        <div className="max-w-3xl mx-auto space-y-3">
          <div className="text-base font-semibold text-danger">
            Client crash captured
          </div>
          <div className="text-mute">
            Screenshot this screen and send it to support so we can fix
            the root cause. The Reset button restores the app to a
            usable state.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={this.copy}
              className="px-3 py-1.5 rounded bg-panel border border-border text-ink"
            >
              Copy details
            </button>
            <button
              type="button"
              onClick={this.reset}
              className="px-3 py-1.5 rounded bg-accent text-ink-on-accent"
            >
              Reset
            </button>
          </div>
          <div className="rounded border border-border bg-panel2/50 p-2 whitespace-pre-wrap break-words">
            <div className="text-danger font-semibold mb-1">
              {this.state.error.name}: {this.state.error.message}
            </div>
            {this.state.error.stack && (
              <div className="text-mute">{this.state.error.stack}</div>
            )}
          </div>
          {this.state.info && (
            <div className="rounded border border-border bg-panel2/50 p-2 whitespace-pre-wrap break-words">
              <div className="text-mute font-semibold mb-1">
                Component stack
              </div>
              <div className="text-mute">{this.state.info}</div>
            </div>
          )}
        </div>
      </div>
    );
  }
}
