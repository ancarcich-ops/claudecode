-- Wipes ALL user accounts and everything that hangs off them
-- (sessions, password-reset tokens, groups, matches, side games,
-- scores, wagers, odds snapshots). The Course catalog is preserved --
-- it has no foreign key to User, so CASCADE does not reach it.
--
-- Run against Postgres (Neon):
--   node scripts/use-postgres.mjs
--   npx prisma db execute --schema prisma/schema.prisma --file scripts/reset-accounts.sql
TRUNCATE "User" RESTART IDENTITY CASCADE;
