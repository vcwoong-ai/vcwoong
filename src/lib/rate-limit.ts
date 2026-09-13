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

/**
 * /api/reports/[id]/run의 자동 checkpoint resume(브라우저가 사용자 조작
 * 없이 스스로 이어서 호출하는 것 — report-wizard.tsx/report-page-client.tsx의
 * 폴링 루프, "이어서 생성" 자동 트리거)은 report-generation rate limit에서
 * 제외한다.
 *
 * 이유: report-generation.ts는 함수 실행시간 상한 때문에 한 번의 보고서
 * 생성이 여러 invocation(체크포인트)으로 나뉘는 게 정상 구조다(GENERATION_
 * BUDGET_MS 참고). 자동 재개 호출까지 사용자가 "또 생성 요청을 보냈다"고
 * 셈하면, 사용자는 실제로 1번만 생성 버튼을 눌렀는데도 체크포인트 횟수만큼
 * 카운터가 올라 10회/시간 한도에 금방 도달해 429가 난다(실제 Production에서
 * 확인된 문제).
 *
 * trigger="auto"만 예외로 인정하고, mode="restart"(재생성 버튼)는 trigger
 * 값과 무관하게 항상 사용자의 명시적 조작이므로 예외 대상에서 제외한다.
 * trigger가 없거나(구버전 호출) "auto"가 아닌 값이면 항상 카운트하는
 * 쪽으로 fail-safe한다 — 알 수 없는 값이 레이트리밋을 우회하는 방향으로
 * 새면 안 된다(resolveModelChainForTier의 화이트리스트 방식과 같은 원칙).
 *
 * 이 예외가 새로운 비용 남용 경로를 열지 않는 이유: report-generation.ts는
 * 섹션이 이미 만들어져 있으면(existingByKey) 다시 AI를 호출하지 않고
 * 재사용한다 — 즉 /run을 아무리 여러 번(trigger=auto라 주장하며) 호출해도
 * 한 보고서당 실제 AI 호출 총량은 섹션 수(고정)로 이미 상한이 걸려 있고,
 * 보고서 자체를 새로 만드는 경로(POST /api/deals/[id]/reports)는 이 예외와
 * 무관하게 기존 rate limit·월 quota를 그대로 적용받는다.
 */
export function isAutoResumeExemptFromRateLimit(
  mode: "resume" | "restart",
  trigger: "user" | "auto" | undefined
): boolean {
  return trigger === "auto" && mode !== "restart";
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
  /**
   * 섹션 재생성(AI 호출 1회) — quota(월 한도)는 "이번 달 새로 만든 보고서
   * 수"만 세기 때문에, 이미 만들어진 보고서의 섹션을 계속 재생성하는
   * 호출은 quota로 막히지 않는다. rate limit이 사실상 유일한 방어선이다.
   */
  sectionRegenerate: { limit: 20, windowMs: 60 * 60 * 1000 },
  /**
   * (더 이상 라우트에서 쓰지 않음 — 남겨둔 이유는 아래 참고)
   * 예전엔 "약한 섹션 일괄 개선"이 한 요청 안에서 최대 5개 섹션을 순차로
   * AI 재생성해서 이 rate limit이 실질적 방어선이었다. 그 순차 호출 구조가
   * Vercel 함수 실행시간 상한을 넘겨 타임아웃으로 죽는 사고(빈/비-JSON
   * 응답 → 프론트 "Unexpected end of JSON input")를 내서, 이제 일괄 개선은
   * 섹션당 정확히 1번의 AI 호출만 하는 기존 sectionRegenerate 라우트를
   * 프론트에서 순차 호출하는 방식으로 바뀌었다(improve-weak GET은 AI 호출
   * 없는 순수 계산이라 rate limit이 필요 없다) — 비용 방어선은 이제
   * sectionRegenerate 하나로 합쳐졌다. 이 항목은 test-security.ts가 존재를
   * 확인하는 회귀 방지용으로만 남겨둔다.
   */
  improveWeak: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** 인바운드 딜 AI 스크리닝(AI 호출 1회): 사용자당 1시간 30회 */
  sourcingScreen: { limit: 30, windowMs: 60 * 60 * 1000 },
  /** 섹터 자동 감지(AI 호출 1회, 토큰 적음): 사용자당 1시간 30회 */
  detectSector: { limit: 30, windowMs: 60 * 60 * 1000 },
  /** 포트폴리오 분기노트 AI 자동요약(AI 호출 1회): 사용자당 1시간 20회 */
  portfolioAutoSummarize: { limit: 20, windowMs: 60 * 60 * 1000 },
  /** 근거 추적 AI 보강 검증(건당 최대 5회 AI 호출): 사용자당 1시간 10회 */
  evidenceVerify: { limit: 10, windowMs: 60 * 60 * 1000 },
  /** IC 질문 생성(건당 배치 AI 호출 최대 1회): 사용자당 1시간 20회 */
  icQuestions: { limit: 20, windowMs: 60 * 60 * 1000 },
} as const;
