import { AgentType, DealSector } from "@prisma/client";
import { BaseAgent } from "./base-agent";

/**
 * Investment agent for sectors outside the BIO/IT specialists.
 *
 * The sector is forwarded so the prompt layer can still pick a specialist
 * voice — Neuron(DEEPTECH), Story(CONSUMER), Maker(CLIMATE) — and only a
 * genuinely unclassified deal falls back to the generalist prompt.
 */
export class GeneralAgent extends BaseAgent {
  constructor(sector?: DealSector) {
    super(AgentType.GENERAL, sector);
  }
}
