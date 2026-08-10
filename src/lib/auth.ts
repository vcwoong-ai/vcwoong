import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { UserRole } from "@prisma/client";
import { checkRateLimit, RATE_LIMITS } from "@/lib/rate-limit";

/** NextAuth가 authorize에 넘겨주는 요청에서 클라이언트 IP를 추정한다 */
function ipFromAuthRequest(headers?: Record<string, unknown>): string {
  const forwarded = headers?.["x-forwarded-for"];
  if (typeof forwarded === "string") {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers?.["x-real-ip"];
  return typeof realIp === "string" && realIp ? realIp : "unknown";
}

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as NextAuthOptions["adapter"],
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("이메일과 비밀번호를 입력해주세요.");
        }

        // 비밀번호 대입 공격 차단. 모든 시도를 세되 성공하면 아래에서
        // 카운터를 비우므로, 결과적으로 실패만 누적된다.
        const ip = ipFromAuthRequest(
          req?.headers as Record<string, unknown> | undefined
        );
        const rateKey = `login:${ip}`;
        const rate = await checkRateLimit(
          rateKey,
          RATE_LIMITS.login.limit,
          RATE_LIMITS.login.windowMs
        );
        if (!rate.allowed) {
          throw new Error(
            "로그인 시도가 너무 많습니다. 잠시 후 다시 시도해 주세요."
          );
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.passwordHash) {
          throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        const isValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isValid) {
          throw new Error("이메일 또는 비밀번호가 올바르지 않습니다.");
        }

        // 성공했으면 실패 카운터를 비워, 정상 사용자가 이전 실패 때문에
        // 나중에 막히는 일이 없게 한다.
        await prisma.rateLimit
          .deleteMany({ where: { key: rateKey } })
          .catch(() => {});

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { id: string; role?: UserRole }).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as UserRole;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
