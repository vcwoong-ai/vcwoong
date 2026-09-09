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
import { inferAgentType } from "./agent-meta";

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
/** 클라이언트 컴포넌트는 이 배럴이 아니라 ./agent-meta에서 바로 import할 것 */
export { AGENT_META, inferAgentType } from "./agent-meta";

/**
 * AgentType + 선택적 DealSector에 따라 전문 에이전트 인스턴스를 반환한다.
 * CLIMATE/CONSUMER는 Prisma AgentType이 없어 섹터 우선으로 라우팅한다.
 *
 * 저장된 agentType이 딜 섹터와 어긋나면(예: IT 딜에 BIO 에이전트) 섹터 전문
 * 에이전트를 우선한다 — 잘못된 rNPV/임상 프레임이 적용되는 것을 막는다.
 */
export function getAgent(agentType: AgentType, sector?: DealSector): BaseAgent {
  if (sector === DealSector.CLIMATE) return new ClimateAgent();
  if (sector === DealSector.CONSUMER) return new ConsumerAgent();

  const sectorAgent = sector ? inferAgentType(sector) : AgentType.GENERAL;
  const effective =
    agentType === AgentType.GENERAL
      ? sectorAgent
      : sectorAgent !== AgentType.GENERAL && sectorAgent !== agentType
        ? sectorAgent
        : agentType;

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
      return new GeneralAgent();
  }
}
