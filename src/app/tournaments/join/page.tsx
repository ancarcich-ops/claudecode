import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { joinTournamentAction } from "@/lib/actions";

export const dynamic = "force-dynamic";

export default async function JoinTournamentPage({
  searchParams,
}: {
  searchParams: { code?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const prefillCode = (searchParams.code ?? "").trim().toUpperCase();

  return (
    <div className="mx-auto max-w-md">
      <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
        Step inside.
      </h1>
      <p className="text-sm text-mute mb-6">
        Drop the 6-character code from your tournament host. You&apos;ll land
        on the standings and can spin up your foursome from there.
      </p>
      <form
        action={joinTournamentAction}
        className="card p-5 space-y-4"
      >
        <div>
          <label className="label" htmlFor="code">
            Invite code
          </label>
          <input
            id="code"
            name="code"
            type="text"
            inputMode="text"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            spellCheck={false}
            defaultValue={prefillCode}
            className="input font-mono tracking-[0.3em] uppercase text-center text-lg"
            placeholder="ABC123"
            minLength={6}
            maxLength={8}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="handicap">
            Your handicap{" "}
            <span className="text-mute normal-case">(optional)</span>
          </label>
          <input
            id="handicap"
            name="handicap"
            type="number"
            step="0.1"
            min={0}
            className="input"
            placeholder="e.g. 12.4"
          />
          <p className="text-[11px] text-mute mt-1">
            Used to seed the NET column on the leaderboard. The
            per-round match still uses the handicap you enter when
            scoring.
          </p>
        </div>
        <button type="submit" className="btn btn-primary w-full">
          Join tournament →
        </button>
      </form>
    </div>
  );
}
