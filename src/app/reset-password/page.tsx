import Link from "next/link";
import { ResetPasswordForm } from "../login/AuthForms";

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string };
}) {
  const token = (searchParams.token ?? "").trim();

  return (
    <div className="mx-auto max-w-sm w-full px-1 pt-8 sm:pt-12">
      {token ? (
        <ResetPasswordForm token={token} />
      ) : (
        <div className="flex flex-col gap-4">
          <h1 className="m-0 font-display font-bold text-[38px] leading-[1.0] tracking-[-0.035em] text-ink">
            Link expired.
          </h1>
          <p className="text-[15px] leading-[1.45] text-mute max-w-[290px]">
            This reset link is missing its token. Request a fresh one.
          </p>
          <div className="text-center text-[13.5px] text-mute">
            <Link href="/forgot-password" className="text-accent font-medium">
              Request a reset link →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
