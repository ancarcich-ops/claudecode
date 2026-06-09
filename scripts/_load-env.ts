// Tiny dotenv loader for one-off Node scripts. We don't want a runtime
// dependency on `dotenv` for the Next.js app (Next has its own .env
// handling), but scripts run via `npx tsx scripts/foo.ts` start with a
// bare process.env that doesn't include anything from .env / .env.local.
// This module reads .env.local (then .env as a fallback) from the repo
// root and copies any missing keys into process.env BEFORE the script's
// own imports try to read them.
//
// Usage: import this as the very first import in the script:
//
//   import "./_load-env";        // must come first
//   import * as gb from "../src/lib/golfbert";  // reads process.env
//   ...
//
// Format supported: standard "KEY=value" per line. Surrounding double or
// single quotes are stripped. Lines starting with "#" and blank lines
// are skipped. Existing process.env values take precedence -- so a real
// shell override still wins.

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) out[key] = value;
  }
  return out;
}

function loadFile(path: string) {
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  const parsed = parseEnvFile(text);
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] === undefined || process.env[k] === "") {
      process.env[k] = v;
    }
  }
}

// .env.local first (developer-private), .env second (shared defaults).
loadFile(resolve(".env.local"));
loadFile(resolve(".env"));
