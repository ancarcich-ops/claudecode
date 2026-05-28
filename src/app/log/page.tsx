import Link from "next/link";
import CravingForm from "@/components/CravingForm";
import { getSettings } from "@/lib/settings";
import { getWhoOrDefault } from "@/lib/identity";

export const dynamic = "force-dynamic";

export default async function LogPage() {
  const settings = await getSettings();
  const who = getWhoOrDefault();
  const photoEnabled = !!process.env.BLOB_READ_WRITE_TOKEN;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-semibold text-ink">Log a craving</h1>
        <p className="text-sm text-mute">
          Logging as <span className="font-semibold text-accent">
            {who === "geena" ? settings.momName : settings.partnerName}
          </span>{" "}
          · tap your name up top to switch.
        </p>
      </div>

      <CravingForm
        who={who}
        momName={settings.momName}
        partnerName={settings.partnerName}
        photoEnabled={photoEnabled}
      />

      <Link href="/hated" className="block text-center text-sm font-semibold text-mute">
        🤢 Logging a food she now hates instead? Add an aversion →
      </Link>
    </div>
  );
}
