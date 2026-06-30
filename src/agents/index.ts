import { AgentType, DealSector } from "@prisma/client";
import { BaseAgent } from "./base-agent";
import { GeneralAgent } from "./general-agent";
import { BioAgent } from "./bio-agent";
import { ITAgent } from "./it-agent";
import { DeepTechAgent } from "./deeptech-agent";
import { ManufacturingAgent } from "./manufacturing-agent";
import { ContentAgent } from "./content-agent";
import { FintechAgent } from "./fintech-agent";
import { ClimateAgent } from "./climate-agent";
import { ConsumerAgent } from "./consumer-agent";

export { BaseAgent } from "./base-agent";
export { GeneralAgent } from "./general-agent";
export { BioAgent } from "./bio-agent";
export { ITAgent } from "./it-agent";
export { DeepTechAgent } from "./deeptech-agent";
export { ManufacturingAgent } from "./manufacturing-agent";
export { ContentAgent } from "./content-agent";
export { FintechAgent } from "./fintech-agent";
export { ClimateAgent } from "./climate-agent";
export { ConsumerAgent } from "./consumer-agent";

/** 에이전트 메타 정보 — UI·사이드바·설정 등에서 사용 */
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
    sectors: [DealSector.CONTENT, DealSector.CONSUMER],
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
    desc: "범용 투자 분석 — 일반/소비재/기후",
    sectors: [DealSector.GENERAL, DealSector.CLIMATE],
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

/**
 * AgentType + 선택적 DealSector에 따라 전문 에이전트 인스턴스를 반환한다.
 */
export function getAgent(agentType: AgentType, sector?: DealSector): BaseAgent {
  const effective =
    agentType !== AgentType.GENERAL
      ? agentType
      : sector
      ? inferAgentType(sector)
      : AgentType.GENERAL;

  switch (effective) {
    case AgentType.BIO:
      return new BioAgent();
    case AgentType.IT:
      return new ITAgent();
    case AgentType.DEEPTECH:
      return new DeepTechAgent();
    case AgentType.MANUFACTURING:
      return new ManufacturingAgent();
    case AgentType.CONTENT:
      return new ContentAgent();
    case AgentType.FINTECH:
      return new FintechAgent();
    default:
      // 섹터 기반 세분화
      if (sector === DealSector.CLIMATE) return new ClimateAgent();
      if (sector === DealSector.CONSUMER) return new ConsumerAgent();
      return new GeneralAgent();
  }
}
