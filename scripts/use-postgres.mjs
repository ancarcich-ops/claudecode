// Swap the active Prisma schema to the Postgres variant. Used by the
// Vercel build (npm run build:vercel) so production builds always pick up
// the postgres provider without changing the canonical schema.prisma file
// that local SQLite development uses.

import { copyFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const src = resolve(root, "prisma/schema.postgres.prisma");
const dst = resolve(root, "prisma/schema.prisma");

if (!existsSync(src)) {
  console.error(`[use-postgres] missing ${src}`);
  process.exit(1);
}
copyFileSync(src, dst);
console.log("[use-postgres] schema.prisma now uses provider = postgresql");
