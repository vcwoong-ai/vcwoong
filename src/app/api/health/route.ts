import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MODEL, FALLBACK_MODEL, isAIConfigured } from "@/lib/claude";

export async function GET() {
  const env = {
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    hasDirectUrl: Boolean(process.env.DIRECT_URL),
    hasNextAuthSecret: Boolean(process.env.NEXTAUTH_SECRET),
    hasNextAuthUrl: Boolean(process.env.NEXTAUTH_URL),
    hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
    aiConfigured: isAIConfigured(),
    aiModel: MODEL,
    aiFallbackModel: FALLBACK_MODEL,
  };

  let dbOk = false;
  let dbError: string | undefined;

  if (env.hasDatabaseUrl) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e);
    }
  }

  return NextResponse.json({
    status: dbOk ? "ok" : "error",
    env,
    dbOk,
    dbError: dbError?.slice(0, 200),
  });
}
