import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { SignUpForm } from "../login/AuthForms";

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  const user = await getCurrentUser();
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
        <h1 className="font-display text-2xl font-semibold tracking-tight mb-1">
          Open the line.
        </h1>
        <p className="text-sm text-mute mb-5">
          Create your account — a handle your group recognizes, plus an
          email so you can always get back in.
        </p>
        <SignUpForm next={next} />
      </div>
    </div>
  );
}
