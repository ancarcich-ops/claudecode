import Link from "next/link";
import { ResetPasswordForm } from "../login/AuthForms";

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = (searchParams.token ?? "").trim();

  return (
    <div className="mx-auto max-w-md mt-16">
      <div className="card p-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
          Set a new password
        </h1>
        {token ? (
          <div className="mt-4">
            <ResetPasswordForm token={token} />
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            <p className="text-sm text-mute">
              This reset link is missing its token. Request a fresh one.
            </p>
            <p className="text-[12px] text-mute">
              <Link
                href="/forgot-password"
                className="underline hover:text-ink"
              >
                Request a reset link
              </Link>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
