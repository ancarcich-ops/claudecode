import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createMatchAction } from "@/lib/actions";
import NewMatchForm from "./NewMatchForm";

export default async function NewMatchPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Post a round</h1>
      <p className="text-sm text-mute mb-6">
        Tell the market what&apos;s on the tee. Odds open the moment you
        publish.
      </p>
      <NewMatchForm action={createMatchAction} defaultUsername={user.username} />
    </div>
  );
}
