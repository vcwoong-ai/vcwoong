/**
 * UsageLog 기록 — 모델 체인의 시도 전부(성공/실패 무관)를 한 줄씩 남긴다.
 *
 * "최종 성공 모델만 기록"하면 실패한 시도(품질 게이트 실패, 빈 응답 등 —
 * 전부 실제 API 호출·토큰 소모가 이미 일어난 뒤의 실패)가 비용 집계에서
 * 조용히 누락된다. claude.ts의 onAttempt 훅이 시도마다 순수 사실(model/
 * 성공여부/토큰/provider/비용)을 넘겨주면, 이 파일이 그걸 UsageLog row로
 * 바꾸는 역할만 한다 — claude.ts는 Prisma/DB를 몰라도 된다.
 *
 * fire-and-forget이다 — 로깅 실패가 보고서/섹션 생성 자체를 실패시키면
 * 안 되므로 항상 .catch(() => {})로 끝낸다(호출부가 await하지 않아도
 * 됨 — 실제로 아무 데도 await하지 않는다).
 */
import { prisma } from "@/lib/prisma";
import type { AgentType, SectionKey } from "@prisma/client";
import type { AIAttemptRecord } from "@/lib/claude";

export interface RecordAIAttemptsParams {
  userId: string;
  dealId?: string;
  reportId?: string;
  agentType: AgentType;
  sectionKey?: SectionKey;
  /** "free" | "paid" — resolveModelChainForTier가 실제로 어느 쪽으로 갈랐는지(진단용) */
  userTier: "free" | "paid";
  /** "cheap" | "balanced" | "premium" */
  taskTier: string;
  attempts: AIAttemptRecord[];
}

export interface UsageLogRow {
  userId: string;
  dealId?: string;
  reportId?: string;
  agentType: AgentType;
  sectionKey?: SectionKey;
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  provider?: string;
  durationMs: number;
  retryCount: number;
  estimatedCost: number | null;
  userTier: string;
  taskTier: string;
}

/**
 * attempts(성공/실패 무관, 체인의 시도 전부)를 UsageLog row로 변환하는
 * 순수 함수 — DB에 실제로 쓰지는 않는다. recordAIAttempts()가 이 결과를
 * 그대로 prisma.usageLog.createMany에 넘긴다. Prisma 연결 없이도 매핑
 * 로직만 단위 테스트할 수 있도록 분리했다.
 */
export function buildUsageLogRows(
  params: RecordAIAttemptsParams
): UsageLogRow[] {
  return params.attempts.map((a) => ({
    userId: params.userId,
    dealId: params.dealId,
    reportId: params.reportId,
    agentType: params.agentType,
    sectionKey: params.sectionKey,
    model: a.model,
    inputTokens: a.inputTokens,
    outputTokens: a.outputTokens,
    totalTokens: a.inputTokens + a.outputTokens,
    provider: a.provider,
    durationMs: a.durationMs,
    retryCount: a.attemptIndex,
    estimatedCost: a.estimatedCost,
    userTier: params.userTier,
    taskTier: params.taskTier,
  }));
}

export function recordAIAttempts(params: RecordAIAttemptsParams): void {
  const rows = buildUsageLogRows(params);
  if (rows.length === 0) return;

  prisma.usageLog.createMany({ data: rows }).catch(() => {});
}
