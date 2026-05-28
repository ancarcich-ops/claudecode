import { getSettings } from "@/lib/settings";
import SettingsForm from "@/components/SettingsForm";
import ThemeToggle from "@/components/ThemeToggle";

export const dynamic = "force-dynamic";

function toDateInput(d: Date | null): string {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default async function SettingsPage() {
  const settings = await getSettings();
  const photoEnabled = !!process.env.BLOB_READ_WRITE_TOKEN;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Settings</h1>

      <SettingsForm
        dueDate={toDateInput(settings.dueDate)}
        momName={settings.momName}
        partnerName={settings.partnerName}
        babyName={settings.babyName ?? ""}
      />

      <div>
        <h2 className="label">Theme</h2>
        <ThemeToggle />
      </div>

      <div className="card p-4 text-sm text-mute">
        <p className="font-semibold text-ink">📸 Photos</p>
        <p className="mt-1">
          {photoEnabled
            ? "Photo uploads are enabled — attach a pic when logging a craving."
            : "To enable craving photos, add a Vercel Blob store to the project (sets BLOB_READ_WRITE_TOKEN). Everything else works without it."}
        </p>
      </div>

      <div className="card p-4 text-sm text-mute">
        <p className="font-semibold text-ink">💕 Sharing with each other</p>
        <p className="mt-1">
          Bloom has no passwords — whoever has the link can add cravings. Use the name
          toggle at the top to log as {settings.momName} or {settings.partnerName}.
        </p>
      </div>
    </div>
  );
}
