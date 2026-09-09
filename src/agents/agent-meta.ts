/**
 * agents/index.ts의 클라이언트 안전 부분만 분리한 파일.
 *
 * agents/index.ts는 모든 섹터 에이전트 클래스(BioAgent, ITAgent 등)를
 * import하는 배럴 파일이고, 그 에이전트들은 전부 `@/lib/claude`(Node 전용
 * API 사용)를 끌고 들어온다. AGENT_META·inferAgentType은 UI 표시용 순수
 * 메타데이터라 클라이언트 컴포넌트(report-wizard.tsx 등)에서도 쓰는데,
 * agents/index.ts에서 가져오면 webpack이 전체 에이전트 배럴을 클라이언트
 * 번들에 끌고 들어가려다 빌드가 깨진다 — 그래서 이 부분만 따로 뽑았다.
 * 서버 쪽 코드는 그대로 agents/index.ts를 쓰면 된다(이 파일을 재-export함).
 */
import { AgentType, DealSector } from "@prisma/client";

export const AGENT_META = [
  {
    id: AgentType.BIO,
    name: "Dr. Cell",
    desc: "바이오/헬스케어 특화 — rNPV, 임상 단계 분석",
    sectors: [DealSector.BIO],
    dot: "bg-purple-400",
    color: "text-purple-700 bg-purple-50 border-purple-200",
  },
  {
    id: AgentType.IT,
    name: "Code",
    desc: "IT/SaaS 특화 — ARR, LTV/CAC, 플랫폼 경제",
    sectors: [DealSector.IT],
    dot: "bg-blue-400",
    color: "text-blue-700 bg-blue-50 border-blue-200",
  },
  {
    id: AgentType.DEEPTECH,
    name: "Neuron",
    desc: "AI/딥테크 특화 — TRL, GPU 유닛 이코노믹스",
    sectors: [DealSector.DEEPTECH],
    dot: "bg-cyan-400",
    color: "text-cyan-700 bg-cyan-50 border-cyan-200",
  },
  {
    id: AgentType.MANUFACTURING,
    name: "Maker",
    desc: "제조/하드웨어 특화 — BOM, Capex, 공급망",
    sectors: [DealSector.MANUFACTURING],
    dot: "bg-orange-400",
    color: "text-orange-700 bg-orange-50 border-orange-200",
  },
  {
    id: AgentType.CONTENT,
    name: "Story",
    desc: "콘텐츠/엔터 특화 — IP 가치, 팬덤 경제",
    sectors: [DealSector.CONTENT],
    dot: "bg-pink-400",
    color: "text-pink-700 bg-pink-50 border-pink-200",
  },
  {
    id: AgentType.FINTECH,
    name: "Vault",
    desc: "핀테크/금융 특화 — TPV, 규제, 신용 리스크",
    sectors: [DealSector.FINTECH],
    dot: "bg-emerald-400",
    color: "text-emerald-700 bg-emerald-50 border-emerald-200",
  },
  {
    id: AgentType.GENERAL,
    name: "General",
    desc: "범용·기후·소비재 — Climate/Consumer 특화 라우팅",
    sectors: [DealSector.GENERAL, DealSector.CLIMATE, DealSector.CONSUMER],
    dot: "bg-gray-400",
    color: "text-gray-700 bg-gray-50 border-gray-200",
  },
] as const;

/**
 * 섹터에서 AgentType을 추론한다.
 */
export function inferAgentType(sector: DealSector): AgentType {
  const meta = AGENT_META.find((m) =>
    (m.sectors as readonly DealSector[]).includes(sector)
  );
  return meta?.id ?? AgentType.GENERAL;
}
