import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { signInAction } from "@/lib/actions";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/");

  return (
    <div className="mx-auto max-w-md mt-16">
      <div className="card p-6">
        <h1 className="text-xl font-semibold mb-1">Sign in</h1>
        <p className="text-sm text-mute mb-5">
          Pick a username. We&apos;ll create your account if it doesn&apos;t
          exist. No password, no email.
        </p>
        <form action={signInAction} className="space-y-3">
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
          </div>
          <button className="btn btn-primary w-full" type="submit">
            Enter the clubhouse
          </button>
        </form>
      </div>
    </div>
  );
}
