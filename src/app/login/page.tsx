import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { signInAction } from "@/lib/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const user = await getCurrentUser();
  // Same-origin relative redirects only.
  const next =
    searchParams.next &&
    searchParams.next.startsWith("/") &&
    !searchParams.next.startsWith("//")
      ? searchParams.next
      : "/";

  if (user) redirect(next);

  return (
    <div className="mx-auto max-w-md mt-16">
      <div className="card p-6">
        <h1 className="text-xl font-semibold mb-1">Sign in</h1>
        <p className="text-sm text-mute mb-5">
          Pick a username. We&apos;ll create your account if it doesn&apos;t
          exist. No password, no email.
        </p>
        <form action={signInAction} className="space-y-3">
          <input type="hidden" name="next" value={next} />
          <div>
            <label className="label" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              name="username"
              className="input"
              placeholder="bryson.d"
              required
              autoFocus
              minLength={2}
              maxLength={20}
              pattern="[A-Za-z0-9._-]+"
            />
            <p className="text-[11px] text-mute mt-1">
              Letters, numbers, dots, underscores, hyphens.
            </p>
          </div>
          <div>
            <label className="label" htmlFor="displayName">
              Display name <span className="text-mute normal-case">(optional)</span>
            </label>
            <input
              id="displayName"
              name="displayName"
              className="input"
              placeholder="Bryson"
              maxLength={32}
            />
            <p className="text-[11px] text-mute mt-1">
              What friends see on the scorecard. Defaults to your username.
            </p>
          </div>
          <button className="btn btn-primary w-full" type="submit">
            Enter the clubhouse
          </button>
        </form>
      </div>
    </div>
  );
}
