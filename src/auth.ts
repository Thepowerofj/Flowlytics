import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { allocateUniquePaymentReference } from "@/modules/billing";
import { prisma } from "@/shared/lib/prisma";
import { getEnv, isAdminEmail } from "@/shared/config/env";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user?.passwordHash || user.disabled) return null;
        const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
    ...(getEnv().GOOGLE_CLIENT_ID && getEnv().GOOGLE_CLIENT_SECRET
      ? [
          Google({
            clientId: getEnv().GOOGLE_CLIENT_ID,
            clientSecret: getEnv().GOOGLE_CLIENT_SECRET,
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false;
      const existing = await prisma.user.findUnique({
        where: { email: user.email.toLowerCase() },
      });
      if (existing?.disabled) return false;
      return true;
    },
    async jwt({ token, user, trigger }) {
      if (user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: user.email.toLowerCase() },
        });
        if (dbUser) {
          const role = isAdminEmail(dbUser.email) ? "ADMIN" : dbUser.role;
          if (role !== dbUser.role) {
            await prisma.user.update({
              where: { id: dbUser.id },
              data: { role },
            });
          }
          token.sub = dbUser.id;
          token.role = role;
          token.email = dbUser.email;
        }
      } else if (token.email && (trigger === "update" || !token.role)) {
        const dbUser = await prisma.user.findUnique({
          where: { email: String(token.email).toLowerCase() },
        });
        if (dbUser) {
          token.sub = dbUser.id;
          token.role = isAdminEmail(dbUser.email) ? "ADMIN" : dbUser.role;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        session.user.role = (token.role as "USER" | "ADMIN") ?? "USER";
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      const env = getEnv();
      const role = user.email && isAdminEmail(user.email) ? "ADMIN" : "USER";
      const now = new Date();
      const adminAccess =
        role === "ADMIN"
          ? {
              isPaid: true,
              accessActivatedAt: now,
              // Far-future marker; admins also bypass access checks by role.
              accessExpiresAt: new Date("2099-01-01T00:00:00.000Z"),
            }
          : {};
      const eftReference = await allocateUniquePaymentReference();
      const updated = await prisma.user.update({
        where: { id: user.id },
        data: {
          role,
          eftReference,
          walletBalance: env.INITIAL_WALLET_CREDITS,
          ...adminAccess,
        },
      });
      if (env.INITIAL_WALLET_CREDITS > 0) {
        await prisma.walletEntry.create({
          data: {
            userId: user.id,
            type: "CREDIT",
            amount: env.INITIAL_WALLET_CREDITS,
            reason: "signup_bonus",
          },
        });
      }
      await prisma.usageCounter.create({
        data: { userId: user.id },
      });
      if (updated.email && updated.eftReference && role !== "ADMIN") {
        void import("@/modules/notify")
          .then(({ sendWelcomeEmail }) =>
            sendWelcomeEmail({
              to: updated.email!,
              name: updated.name,
              paymentReference: updated.eftReference!,
            }),
          )
          .catch((err) => console.error("[mail] welcome", err));
      }
    },
  },
  secret: getEnv().AUTH_SECRET,
});
