"use server";

import { revalidatePath } from "next/cache";
import { put } from "@vercel/blob";
import { prisma } from "./db";
import { getWhoOrDefault, setWhoCookie, type Who } from "./identity";
import { getSettings } from "./settings";
import { pregnancyProgress } from "./pregnancy";

function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function intIn(form: FormData, key: string, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(str(form, key), 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// Photos are optional. If a file is attached AND the blob store is wired up
// (BLOB_READ_WRITE_TOKEN present, as it is by default on Vercel), upload and
// return the public URL. Otherwise we just skip — the app works fine without.
async function maybeUploadPhoto(form: FormData): Promise<string | null> {
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return null;
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_") || "craving.jpg";
  const blob = await put(`cravings/${Date.now()}-${safeName}`, file, {
    access: "public",
    addRandomSuffix: true,
  });
  return blob.url;
}

function whoFromForm(form: FormData): Who {
  const v = str(form, "loggedBy");
  return v === "geena" || v === "daddy" ? v : getWhoOrDefault();
}

export async function setWhoAction(who: Who) {
  setWhoCookie(who);
  revalidatePath("/", "layout");
}

export async function addCraving(form: FormData) {
  const food = str(form, "food");
  if (!food) return;

  const settings = await getSettings();
  const now = new Date();
  const cravedAtRaw = str(form, "cravedAt");
  const cravedAt = cravedAtRaw ? new Date(cravedAtRaw) : now;
  const prog = pregnancyProgress(settings.dueDate, cravedAt);
  const photoUrl = await maybeUploadPhoto(form);

  await prisma.craving.create({
    data: {
      food,
      category: str(form, "category") || "other",
      intensity: intIn(form, "intensity", 1, 5, 3),
      loggedBy: whoFromForm(form),
      isWild: str(form, "isWild") === "on" || str(form, "isWild") === "true",
      satisfied: str(form, "satisfied") === "on" || str(form, "satisfied") === "true",
      satisfiedBy: str(form, "satisfiedBy") || null,
      notes: str(form, "notes") || null,
      photoUrl,
      week: prog.hasDueDate ? prog.week : null,
      trimester: prog.hasDueDate ? prog.trimester : null,
      cravedAt,
    },
  });
  revalidatePath("/", "layout");
}

// Edit an existing craving. Only touches the descriptive fields the edit form
// exposes — satisfied/loggedBy stay as they were (those are managed on the
// card). A new photo replaces the old one; leaving the file blank keeps it.
// Changing the date re-stamps the pregnancy week/trimester.
export async function updateCraving(id: string, form: FormData) {
  const food = str(form, "food");
  if (!food) return;

  const settings = await getSettings();
  const photoUrl = await maybeUploadPhoto(form);

  const data: Record<string, unknown> = {
    food,
    category: str(form, "category") || "other",
    intensity: intIn(form, "intensity", 1, 5, 3),
    isWild: str(form, "isWild") === "on" || str(form, "isWild") === "true",
    notes: str(form, "notes") || null,
  };
  if (photoUrl) data.photoUrl = photoUrl;

  const cravedAtRaw = str(form, "cravedAt");
  if (cravedAtRaw) {
    const cravedAt = new Date(cravedAtRaw);
    const prog = pregnancyProgress(settings.dueDate, cravedAt);
    data.cravedAt = cravedAt;
    data.week = prog.hasDueDate ? prog.week : null;
    data.trimester = prog.hasDueDate ? prog.trimester : null;
  }

  await prisma.craving.update({ where: { id }, data });
  revalidatePath("/", "layout");
}

export async function addAversion(form: FormData) {
  const food = str(form, "food");
  if (!food) return;

  const settings = await getSettings();
  const prog = pregnancyProgress(settings.dueDate, new Date());

  await prisma.aversion.create({
    data: {
      food,
      severity: intIn(form, "severity", 1, 5, 3),
      loggedBy: whoFromForm(form),
      notes: str(form, "notes") || null,
      week: prog.hasDueDate ? prog.week : null,
      trimester: prog.hasDueDate ? prog.trimester : null,
    },
  });
  revalidatePath("/", "layout");
}

// Toggle "did someone come through?" — when turning it on, record who. When
// turning off, clear the credit.
export async function toggleSatisfied(id: string, satisfiedBy: Who | "takeout") {
  const c = await prisma.craving.findUnique({ where: { id } });
  if (!c) return;
  const next = !c.satisfied;
  await prisma.craving.update({
    where: { id },
    data: { satisfied: next, satisfiedBy: next ? satisfiedBy : null },
  });
  revalidatePath("/", "layout");
}

export async function setStars(id: string, stars: number) {
  await prisma.craving.update({
    where: { id },
    data: { stars: Math.min(5, Math.max(0, Math.round(stars))) },
  });
  revalidatePath("/", "layout");
}

export async function setWild(id: string, isWild: boolean) {
  await prisma.craving.update({ where: { id }, data: { isWild } });
  revalidatePath("/", "layout");
}

export async function deleteCraving(id: string) {
  await prisma.craving.delete({ where: { id } }).catch(() => {});
  revalidatePath("/", "layout");
}

export async function deleteAversion(id: string) {
  await prisma.aversion.delete({ where: { id } }).catch(() => {});
  revalidatePath("/", "layout");
}

export async function updateSettings(form: FormData) {
  const dueDateRaw = str(form, "dueDate");
  await prisma.settings.upsert({
    where: { id: "singleton" },
    update: {
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
      momName: str(form, "momName") || "Geena",
      partnerName: str(form, "partnerName") || "Daddy",
      babyName: str(form, "babyName") || null,
    },
    create: {
      id: "singleton",
      dueDate: dueDateRaw ? new Date(dueDateRaw) : null,
      momName: str(form, "momName") || "Geena",
      partnerName: str(form, "partnerName") || "Daddy",
      babyName: str(form, "babyName") || null,
    },
  });
  revalidatePath("/", "layout");
}
