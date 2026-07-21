import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserAccess } from "@/modules/identity/application/accountAccess";

/** Require login + active product access (admins always pass). */
export async function requireActiveAccess(redirectTo = "/billing") {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.user.role === "ADMIN") return session;
  const access = await getUserAccess(session.user.id);
  if (!access.hasAccess) redirect(redirectTo);
  return session;
}
