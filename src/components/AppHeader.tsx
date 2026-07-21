import Link from "next/link";
import { auth, signOut } from "@/auth";
import { BrandLogo } from "./BrandLogo";

export async function AppHeader() {
  const session = await auth();
  return (
    <header className="app-shell-header">
      <BrandLogo href="/home" size="sm" />
      <div className="flex items-center gap-2 sm:gap-3">
        <Link className="btn btn-ghost py-1.5 text-sm" href="/billing">
          Billing
        </Link>
        <Link className="btn btn-ghost py-1.5 text-sm" href="/settings">
          Settings
        </Link>
        <Link
          className="btn btn-ghost py-1.5 text-sm"
          href="/schedules"
          title="Early access — schedules re-run uploaded data until external connectors ship"
        >
          Schedules
          <span className="schedule-early-pill">Early</span>
        </Link>
        {session?.user?.role === "ADMIN" && (
          <Link className="btn btn-secondary py-1.5 text-sm" href="/admin">
            Admin
          </Link>
        )}
        <span className="hidden max-w-[180px] truncate text-sm text-muted md:inline">
          {session?.user?.email}
        </span>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button className="btn btn-ghost text-sm" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
