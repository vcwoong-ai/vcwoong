import { SectionKey, AgentType, DealSector } from "@prisma/client";
import { generateText } from "@/lib/claude";
import { getSystemPrompt } from "@/prompts/system-prompts";
import {
  buildSectionPrompt,
  SectionPromptContext,
} from "@/prompts/section-prompts";
import { GenerationResult } from "@/types";
import { SECTION_META } from "@/types";
import {
  buildCompanyOverviewPrompt,
  COMPANY_SECTION,
  flavorKeyForSector,
  SECTOR_COMPANY_FLAVOR,
} from "./overview-helpers";

/** IR 문서당 컨텍스트 길이 (품질↑ — 재무표·파이프라인 누락 방지) */
const DOC_CONTEXT_CHARS = 8000;

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
      .map((d) => {
        const text = d.parsedText ?? "";
        const clipped =
          text.length > DOC_CONTEXT_CHARS
            ? `${text.slice(0, DOC_CONTEXT_CHARS)}\n…(이하 생략)`
            : text;
        return `### ${d.name}\n${clipped}`;
      })
      .join("\n\n");
  }

  async generateSection(
    input: AgentInput,
    sectionKey: SectionKey
  ): Promise<GenerationResult> {
    const systemPrompt = getSystemPrompt(this.agentType, this.sector);

    // 모든 에이전트 공통: 회사개요는 섹터 특화 프롬프트 사용
    if (sectionKey === COMPANY_SECTION) {
      const key = flavorKeyForSector(this.sector ?? input.sector);
      const flavor =
        SECTOR_COMPANY_FLAVOR[key] ?? SECTOR_COMPANY_FLAVOR.GENERAL;
      const userPrompt = buildCompanyOverviewPrompt(input, flavor);
      const result = await generateText(
        [{ role: "user", content: userPrompt }],
        { systemPrompt, maxTokens: 4096, temperature: 0.35 }
      );
      return {
        sectionKey,
        content: result.content,
        tokensUsed: result.inputTokens + result.outputTokens,
        modelUsed: result.usedModel,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      };
    }

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
        temperature: 0.35,
      }
    );

    return {
      sectionKey,
      content: result.content,
      tokensUsed: result.inputTokens + result.outputTokens,
      modelUsed: result.usedModel,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    };
  }

  async generateAllSections(input: AgentInput): Promise<GenerationResult[]> {
    const results: GenerationResult[] = [];
    const sectionKeys = SECTION_META.map((s) => s.key);

    for (const sectionKey of sectionKeys) {
      const result = await this.generateSection(input, sectionKey);
      results.push(result);
    }

    return results;
  }
}
