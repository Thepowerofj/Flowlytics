import { auth } from "@/auth";
import { AppError } from "@/shared/lib/errors";
import { assertActiveAccess } from "@/modules/identity/application/accountAccess";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AppError("Unauthorized", "UNAUTHORIZED", 401);
  }
  return session.user;
}

/** Logged-in user with active product access (admins always pass). */
export async function requireActiveUser() {
  const user = await requireUser();
  await assertActiveAccess(user.id);
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") {
    throw new AppError("Forbidden", "FORBIDDEN", 403);
  }
  return user;
}
