import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { getWhoOrDefault } from "@/lib/identity";
import CravingForm from "@/components/CravingForm";

export const dynamic = "force-dynamic";

export default async function EditCravingPage({
  params,
}: {
  params: { id: string };
}) {
  const craving = await prisma.craving.findUnique({ where: { id: params.id } });
  if (!craving) notFound();

  const settings = await getSettings();
  const who = getWhoOrDefault();
  const photoEnabled = !!process.env.BLOB_READ_WRITE_TOKEN;

  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl font-semibold text-ink">Edit craving</h1>
      <CravingForm
        mode="edit"
        craving={craving}
        who={who}
        momName={settings.momName}
        partnerName={settings.partnerName}
        photoEnabled={photoEnabled}
      />
    </div>
  );
}
