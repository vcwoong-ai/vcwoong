/**
 * DB 기반 고정 윈도우 레이트리밋.
 *
 * 서버리스는 요청마다 다른 인스턴스로 갈 수 있어 in-memory 카운터가
 * 무의미하다. Neon(Postgres)을 공유 저장소로 써서 인스턴스와 무관하게
 * 동작하게 한다.
 *
 * 특히 AI 생성 호출은 호출당 실제 비용(OpenRouter)이 나가므로, 가입에
 * 아무 마찰이 없는 지금 구조에서는 봇이 계정을 양산해 비용을 태울 수 있다.
 */

import { prisma } from "@/lib/prisma";

export interface RateLimitResult {
  allowed: boolean;
  /** 남은 허용 횟수 */
  remaining: number;
  /** 윈도우가 풀릴 때까지 남은 초 */
  retryAfterSec: number;
}

/** 만료된 카운터를 가끔씩만 청소한다 (매 요청마다 쓸어내면 낭비) */
const SWEEP_PROBABILITY = 0.02;

/**
 * 요청 IP를 추정한다. Vercel은 x-forwarded-for에 클라이언트 IP를 넣는다.
 * 프록시가 여러 단계면 맨 앞이 원 클라이언트다.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

/**
 * `key`에 대해 `windowMs` 동안 `limit`회까지 허용한다.
 *
 * DB 오류 시에는 통과시킨다(fail-open) — 레이트리밋 저장소 장애로 가입·생성
 * 전체가 막히는 게 더 큰 사고다.
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowMs);

  try {
    // 지난 윈도우 기록은 지우고 새로 센다.
    await prisma.rateLimit.deleteMany({
      where: { key, expiresAt: { lt: now } },
    });

    // increment는 DB 레벨에서 원자적이라 동시 요청도 정확히 누적된다.
    const record = await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, expiresAt },
      update: { count: { increment: 1 } },
    });

    if (Math.random() < SWEEP_PROBABILITY) {
      prisma.rateLimit
        .deleteMany({ where: { expiresAt: { lt: now } } })
        .catch(() => {});
    }

    const retryAfterSec = Math.max(
      1,
      Math.ceil((record.expiresAt.getTime() - now.getTime()) / 1000)
    );

    return {
      allowed: record.count <= limit,
      remaining: Math.max(0, limit - record.count),
      retryAfterSec,
    };
  } catch (error) {
    console.error("[RateLimit] 확인 실패 — 통과 처리:", error);
    return { allowed: true, remaining: limit, retryAfterSec: 0 };
  }
}

/** 자주 쓰는 정책 모음 (한 곳에서 조정할 수 있게) */
export const RATE_LIMITS = {
  /** 회원가입: IP당 1시간 5회 */
  register: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** 로그인 실패: IP당 15분 10회 (성공 시엔 세지 않음) */
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  /** AI 보고서 생성: 사용자당 1시간 10회 (월 한도와 별개로 폭주 방지) */
  reportGeneration: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** 딜 스코어링(AI 호출): 사용자당 1시간 20회 */
  dealScoring: { limit: 20, windowMs: 60 * 60 * 1000 },
  /** 딥다이브 검증(주장당 검색+AI 호출, 건당 최대 5회): 사용자당 1시간 10회 */
  deepDive: { limit: 10, windowMs: 60 * 60 * 1000 },
} as const;
