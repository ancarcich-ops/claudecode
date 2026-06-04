import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { createTournamentAction } from "@/lib/actions";
import NewTournamentForm from "./NewTournamentForm";

export const dynamic = "force-dynamic";

export default async function NewTournamentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
        Open the field.
      </h1>
      <p className="text-sm text-mute mb-6">
        Pick the scoring, set the rounds, share the code. Players can be in
        different foursomes &mdash; the leaderboard rolls everything up.
      </p>
      <NewTournamentForm action={createTournamentAction} />
    </div>
  );
}
