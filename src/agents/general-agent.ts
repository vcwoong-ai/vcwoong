import { AgentType } from "@prisma/client";
import { BaseAgent } from "./base-agent";

/**
 * General investment agent for non-specialized sectors.
 * Handles GENERAL, CONSUMER, DEEPTECH, CLIMATE sectors.
 */
export class GeneralAgent extends BaseAgent {
  constructor() {
    super(AgentType.GENERAL);
  }
}
