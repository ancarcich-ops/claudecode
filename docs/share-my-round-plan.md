# Share My Round — v1 plan (email + live share link)

Decision: email + public share-link page now; SMS via Twilio later.

## Schema (both prisma files; user runs `prisma db push`)
model RoundShare:
- id cuid, matchId -> Match (Cascade), matchPlayerId (whose pace/scores)
- createdById, token @unique (public link), recipientEmail?
- includeScores Bool default true
- milestones String default "FRONT9,FINISH" (also EVERY6)
- destAddress?, destLat?, destLng? (geocoded once via Mapbox)
- lastSentMilestone?, createdAt
Match gets `roundShares RoundShare[]`.

## Engine (src/lib/roundShare.ts)
- computePace(match, playerId): elapsed = now - startedAt; perHole =
  elapsed / holesPlayed; projectedFinish = startedAt + perHole * holes.
- eta(dest): Mapbox directions course(center) -> dest, driving; ETA =
  projectedFinish + duration. Geocode destAddress on save (Mapbox).
- milestoneReached(match, share): FRONT9 when player has 9 scores,
  EVERY6 at 6/12, FINISH at all holes. Compare vs lastSentMilestone.
- sendUpdate(share, milestone): email via src/lib/email.ts with
  summary line + scores (if includeScores) + link /r/[token].

## Hooks
- After score writes in BOTH paths (logScoreAction + /api/mobile/
  matches/[id]/score): fire-and-forget checkRoundShares(matchId).

## UI
- Web: "Share my round" card on match page (creator/seated): add
  recipient email, milestones checkboxes, include-scores toggle,
  destination address. List + revoke existing shares.
- Public page app/r/[token]/page.tsx: no auth; course, thru-N, pace,
  projected finish, ETA home, scores if enabled; auto-refresh.
- Mobile API phase 2: POST /api/mobile/matches/:id/share.

## Order
1. Schema + engine + email template
2. Score-write hooks
3. Public /r/[token] page
4. Match-page settings card
5. Rork spec addendum (phase 2)
