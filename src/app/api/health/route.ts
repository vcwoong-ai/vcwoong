import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { MODEL, FALLBACK_MODELS, isAIConfigured } from "@/lib/claude";
import { secureCompare } from "@/lib/secure-compare";

/**
 * 인증 없이 열려 있는 헬스체크 — 업타임 모니터링용.
 *
 * 예전엔 DB URL·NextAuth 시크릿 설정 여부, AI 모델 이름, DB 연결 실패 시
 * 원본 에러 메시지(호스트명 등 내부 정보가 섞일 수 있음)까지 그대로
 * 돌려줬다. 인증 없이 누구나 볼 수 있는 엔드포인트가 배포 구성·내부 에러를
 * 그대로 노출하는 건 공격자에게 정찰 정보만 주고 얻는 게 없다.
 *
 * 상세 진단은 HEALTH_CHECK_SECRET 헤더(X-Health-Secret)가 맞을 때만 보여준다
 * (설정 안 하면 기존처럼 상세 정보 없이 상태만 반환 — 새 인프라 없이 선택적).
 */
export async function GET(request: NextRequest) {
  const hasDatabaseUrl = Boolean(process.env.DATABASE_URL);

  let dbOk = false;
  let dbError: string | undefined;

  if (hasDatabaseUrl) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbOk = true;
    } catch (e) {
      dbError = e instanceof Error ? e.message : String(e);
    }
  }

  const secret = process.env.HEALTH_CHECK_SECRET?.trim();
  const provided = request.headers.get("x-health-secret");
  const showDetails = Boolean(secret) && Boolean(provided) && secureCompare(provided!, secret!);

  if (!showDetails) {
    return NextResponse.json({ status: dbOk ? "ok" : "error" });
  }

  return NextResponse.json({
    status: dbOk ? "ok" : "error",
    env: {
      hasDatabaseUrl,
      hasDirectUrl: Boolean(process.env.DIRECT_URL),
      hasNextAuthSecret: Boolean(process.env.NEXTAUTH_SECRET),
      hasNextAuthUrl: Boolean(process.env.NEXTAUTH_URL),
      hasOpenRouterKey: Boolean(process.env.OPENROUTER_API_KEY?.trim()),
      aiConfigured: isAIConfigured(),
      aiModel: MODEL,
      aiFallbackModels: FALLBACK_MODELS,
    },
    dbOk,
    dbError: dbError?.slice(0, 200),
  });
}
