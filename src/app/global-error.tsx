"use client";

// Root error boundary. Without this, any uncaught render error (client or
// an RSC error surfaced during navigation) blanks the whole app with the
// bare Next.js "Application error: a client-side exception has occurred"
// screen -- no shell, no way to recover, and no visible detail. This
// keeps the page usable, offers a retry, and shows the error's digest +
// message so a stray production crash can actually be reported/diagnosed.

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface it in the console for anyone with devtools open.
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ece7dd",
          color: "#1a1a17",
          fontFamily: "system-ui, -apple-system, sans-serif",
          padding: 24,
        }}
      >
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div
            style={{
              fontSize: 12,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#2f6b4f",
              fontWeight: 600,
            }}
          >
            Something went sideways
          </div>
          <h1
            style={{
              fontSize: 26,
              fontWeight: 700,
              margin: "10px 0 8px",
              lineHeight: 1.15,
            }}
          >
            That shot found the trees.
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "#5b5b52",
              lineHeight: 1.5,
              margin: "0 0 20px",
            }}
          >
            The app hit an unexpected error. Try again — if it keeps
            happening, send us the code below.
          </p>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              height: 48,
              padding: "0 28px",
              borderRadius: 12,
              border: "none",
              background: "#2f6b4f",
              color: "#fff",
              fontSize: 16,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <a
            href="/"
            style={{
              display: "block",
              marginTop: 14,
              fontSize: 13,
              color: "#2f6b4f",
              textDecoration: "none",
            }}
          >
            Back to home →
          </a>
          {(error.digest || error.message) && (
            <pre
              style={{
                marginTop: 22,
                fontSize: 11,
                color: "#8a8a80",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                fontFamily: "ui-monospace, monospace",
              }}
            >
              {error.digest ? `ref: ${error.digest}\n` : ""}
              {error.message || ""}
            </pre>
          )}
        </div>
      </body>
    </html>
  );
}
