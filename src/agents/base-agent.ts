import { SectionKey, AgentType, DealSector } from "@prisma/client";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import {
  buildSectionPrompt,
  SectionPromptContext,
} from "@/prompts/section-prompts";
import { GenerationResult } from "@/types";
import { SECTION_META } from "@/types";

export interface AgentInput {
  dealId: string;
  companyName: string;
  sector: DealSector;
  agentType: AgentType;
  investRound?: string;
  investAmount?: number;
  valuation?: number;
  documents: Array<{ name: string; parsedText: string | null }>;
  additionalContext?: string;
}

export abstract class BaseAgent {
  protected agentType: AgentType;
  protected sector?: DealSector;

  constructor(agentType: AgentType, sector?: DealSector) {
    this.agentType = agentType;
    this.sector = sector;
  }

  protected buildDocumentContext(
    documents: Array<{ name: string; parsedText: string | null }>
  ): string {
    if (!documents.length) return "제공된 자료 없음";

    return documents
      .filter((d) => d.parsedText)
      .map((d) => `### ${d.name}\n${d.parsedText?.slice(0, 3000)}...`)
      .join("\n\n");
  }

  async generateSection(
    input: AgentInput,
    sectionKey: SectionKey
  ): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(this.agentType, this.sector);
    const documentContext = this.buildDocumentContext(input.documents);

    const promptContext: SectionPromptContext = {
      companyName: input.companyName,
      sector: input.sector,
      investRound: input.investRound,
      investAmount: input.investAmount,
      valuation: input.valuation,
      documentContext,
      additionalContext: input.additionalContext,
    };

    const userPrompt = buildSectionPrompt(sectionKey, promptContext);

    const result = await generateText(
      [{ role: "user", content: userPrompt }],
      {
        systemPrompt,
        maxTokens: 4096,
      }
    );

    return {
      sectionKey,
      content: result.content,
      tokensUsed: result.inputTokens + result.outputTokens,
    };
  }

  async generateAllSections(input: AgentInput): Promise<GenerationResult[]> {
    const results: GenerationResult[] = [];
    const sectionKeys = SECTION_META.map((s) => s.key);

    // Generate sections sequentially to avoid rate limits
    for (const sectionKey of sectionKeys) {
      const result = await this.generateSection(input, sectionKey);
      results.push(result);
    }

    return results;
  }
}
