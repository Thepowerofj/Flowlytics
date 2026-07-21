export const ACCESS_PERIOD_DAYS = 30;

export type AccessStatus = "active" | "pending_payment" | "expired" | "disabled";

export type AccessUser = {
  role: "USER" | "ADMIN" | string;
  disabled: boolean;
  accessExpiresAt: Date | null;
  eftDeclaredAt?: Date | null;
};

export function hasActiveAccess(user: AccessUser, now = new Date()): boolean {
  if (user.role === "ADMIN") return true;
  if (user.disabled) return false;
  if (!user.accessExpiresAt) return false;
  return user.accessExpiresAt.getTime() > now.getTime();
}

export function accessStatusOf(user: AccessUser, now = new Date()): AccessStatus {
  // Admin ban blocks login; time-based expiry does not set disabled.
  if (user.disabled) return "disabled";
  if (user.role === "ADMIN") return "active";
  if (user.accessExpiresAt && user.accessExpiresAt.getTime() > now.getTime()) {
    return "active";
  }
  if (user.accessExpiresAt && user.accessExpiresAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return "pending_payment";
}

export function accessExpiresInDays(from = new Date(), days = ACCESS_PERIOD_DAYS): Date {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
