import { AgentType, DealSector } from "@prisma/client";
import { BaseAgent } from "./base-agent";
import { GeneralAgent } from "./general-agent";
import { BioAgent } from "./bio-agent";
import { ITAgent } from "./it-agent";

export { BaseAgent } from "./base-agent";
export { GeneralAgent } from "./general-agent";
export { BioAgent } from "./bio-agent";
export { ITAgent } from "./it-agent";

/**
 * Returns the appropriate agent based on sector and explicit agent type.
 * BIO sector → Dr. Cell (BioAgent)
 * IT/FINTECH sector → ITAgent
 * Everything else → GeneralAgent
 */
export function getAgent(
  agentType: AgentType,
  sector?: DealSector
): BaseAgent {
  if (agentType === AgentType.BIO || sector === DealSector.BIO) {
    return new BioAgent();
  }
  if (
    agentType === AgentType.IT ||
    sector === DealSector.IT ||
    sector === DealSector.FINTECH
  ) {
    return new ITAgent();
  }
  return new GeneralAgent();
}

export function inferAgentType(sector: DealSector): AgentType {
  if (sector === DealSector.BIO) return AgentType.BIO;
  if (sector === DealSector.IT || sector === DealSector.FINTECH)
    return AgentType.IT;
  return AgentType.GENERAL;
}
