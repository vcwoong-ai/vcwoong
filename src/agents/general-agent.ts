import { AgentType } from "@prisma/client";
import { BaseAgent } from "./base-agent";

/**
 * General investment agent for non-specialized sectors.
 * CLIMATE/CONSUMER는 각각 ClimateAgent/ConsumerAgent로 라우팅된다.
 */
export class GeneralAgent extends BaseAgent {
  constructor() {
    super(AgentType.GENERAL);
  }
}
