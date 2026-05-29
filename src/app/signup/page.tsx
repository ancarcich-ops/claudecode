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
    <div className="mx-auto max-w-sm w-full px-1 pt-8 sm:pt-12">
      <SignUpForm next={next} />
    </div>
  );
}
