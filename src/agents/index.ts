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
 *
 * BioAgent and ITAgent add sector-specific enrichment beyond prompting
 * (rNPV, FDA/PubMed lookups, SaaS metrics), so they are selected explicitly.
 * Every other sector runs through GeneralAgent, which forwards the sector so
 * the prompt layer can still apply its specialist voice.
 */
export function getAgent(
  agentType: AgentType,
  sector?: DealSector
): BaseAgent {
  if (agentType === AgentType.BIO || sector === DealSector.BIO) {
    return new BioAgent();
  }
  if (agentType === AgentType.IT || sector === DealSector.IT) {
    return new ITAgent();
  }
  return new GeneralAgent(sector);
}

export function inferAgentType(sector: DealSector): AgentType {
  if (sector === DealSector.BIO) return AgentType.BIO;
  if (sector === DealSector.IT) return AgentType.IT;
  return AgentType.GENERAL;
}
