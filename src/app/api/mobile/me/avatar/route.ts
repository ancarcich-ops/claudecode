// POST   /api/mobile/me/avatar  -- upload a profile photo.
//   Body: the raw image bytes. Content-Type header must be image/*
//   (e.g. image/jpeg). Max 4 MB. Uploads to Vercel Blob and sets
//   User.avatarUrl. 200: { "avatarUrl": "https://..." }.
// DELETE /api/mobile/me/avatar  -- clear the photo (falls back to the
//   initials bubble). 200: { "ok": true, "avatarUrl": null }.
//
// Mirrors the web uploadAvatarAction / clearAvatarUrlAction: same 4 MB
// limit, same blob path scheme, same BLOB_READ_WRITE_TOKEN gate.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getUserFromBearer, unauthorized } from "@/lib/mobileAuth";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    return NextResponse.json(
      { error: "Send the image bytes with an image/* Content-Type." },
      { status: 400 },
    );
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Photo upload isn't configured on this deployment." },
      { status: 503 },
    );
  }

  const bytes = await req.arrayBuffer();
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Empty upload." }, { status: 400 });
  }
  if (bytes.byteLength > MAX_BYTES) {
    return NextResponse.json(
      { error: "File too large (max 4 MB)." },
      { status: 400 },
    );
  }

  const ext = contentType.split("/")[1]?.split(";")[0]?.slice(0, 4) || "jpg";
  const path = `avatars/${user.id}-${bytesStamp(bytes)}.${ext}`;

  // Dynamic import so the blob dep isn't pulled into routes that don't
  // use it (matches the web action).
  const { put } = await import("@vercel/blob");
  const blob = await put(path, bytes, {
    access: "public",
    contentType,
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { avatarUrl: blob.url },
  });

  return NextResponse.json({ avatarUrl: blob.url });
}

export async function DELETE(req: Request) {
  const user = await getUserFromBearer(req);
  if (!user) return unauthorized();
  await prisma.user.update({
    where: { id: user.id },
    data: { avatarUrl: null },
  });
  return NextResponse.json({ ok: true, avatarUrl: null });
}

// A stable-per-request suffix without Date.now() dependence issues --
// derived from the payload length + a short random-free hash so repeated
// uploads don't collide within the same second.
function bytesStamp(bytes: ArrayBuffer): string {
  let h = 2166136261;
  const view = new Uint8Array(bytes);
  const step = Math.max(1, Math.floor(view.length / 512));
  for (let i = 0; i < view.length; i += step) {
    h = (h ^ view[i]) * 16777619;
  }
  return (h >>> 0).toString(36) + view.length.toString(36);
}
