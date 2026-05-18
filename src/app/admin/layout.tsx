import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isUserAdmin } from "@/lib/admin";

// Gate every /admin/* route. Anyone not in ADMIN_USERNAMES gets
// bounced to /login (signed out) or / (signed in but not admin).
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isUserAdmin(user)) redirect("/");
  return (
    <div className="min-h-screen bg-bg text-ink">
      <div className="border-b border-border bg-panel2/40 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm">
          <Link
            href="/admin"
            className="text-mute hover:text-ink uppercase tracking-wider text-[11px]"
          >
            Admin
          </Link>
          <span className="text-mute">·</span>
          <Link href="/admin/courses" className="text-mute hover:text-ink">
            Courses
          </Link>
          <Link href="/admin/matches" className="text-mute hover:text-ink">
            Matches
          </Link>
        </div>
        <Link href="/" className="text-[11px] text-mute hover:text-ink">
          Exit admin
        </Link>
      </div>
      {children}
    </div>
  );
}
