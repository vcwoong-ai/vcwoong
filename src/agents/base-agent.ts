import { SectionKey, AgentType, DealSector } from "@prisma/client";
import { generateText, TaskTier, AIAttemptListener } from "@/lib/claude";
import { buildSectionValidator } from "@/lib/section-generation-gate";
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
  /** 생성 품질 게이트 로그(AI_QUALITY_GATE_FAIL 등)에 붙일 문맥용 — 선택값, 없어도 생성 자체는 그대로 동작 */
  reportId?: string;
  /**
   * 이번 생성에 쓸 모델 체인(Cost-aware Model Router, claude.ts의
   * resolveModelChainForTier 참고) — 호출부(report-generation.ts 등)가
   * 사용자 플랜을 보고 미리 계산해 넘긴다. base-agent.ts는 구독·과금
   * 개념을 몰라도 되도록 이미 계산된 배열만 그대로 전달한다. 없으면
   * claude.ts의 기존 기본 체인(MODEL + FALLBACK_MODELS)을 쓴다.
   */
  modelChain?: string[];
  /**
   * 이번 섹션 생성의 모든 AI 호출 시도(성공/실패)를 통보받는 훅 —
   * 호출부(report-generation.ts 등)가 UsageLog에 시도별 비용/토큰을
   * 빠짐없이 기록하는 용도(claude.ts의 ClaudeOptions.onAttempt와 동일 의미).
   */
  onAttempt?: AIAttemptListener;
}

/**
 * 섹션별 task tier(3-tier Cost-Performance Model Router) — 투자의견/
 * 밸류에이션처럼 최종 투자 판단에 직접 쓰이는 섹션만 premium이고, 나머지
 * 기본 섹션은 balanced다. 이 파일이 유일한 기준점이라 report-generation.ts,
 * sections/regenerate/route.ts, 각 섹터 에이전트가 전부 이 함수 하나로
 * tier를 정한다(중복 정의로 서로 어긋나는 것을 방지).
 */
export function resolveTaskTierForSection(sectionKey: SectionKey): TaskTier {
  if (sectionKey === SectionKey.OPINION_SUMMARY || sectionKey === SectionKey.VALUATION) {
    return "premium";
  }
  return "balanced";
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
    // "이 응답을 저장해도 되는가"를 sectionKey 기준으로 판정한다(claude.ts는
    // 섹션 개념을 모르므로 이 콜백을 그대로 주입만 받는다) — section-generation-gate.ts 참고.
    const validate = buildSectionValidator(sectionKey);
    const logContext = { reportId: input.reportId, section: sectionKey };

    // 모든 에이전트 공통: 회사개요는 섹터 특화 프롬프트 사용
    if (sectionKey === COMPANY_SECTION) {
      const key = flavorKeyForSector(this.sector ?? input.sector);
      const flavor =
        SECTOR_COMPANY_FLAVOR[key] ?? SECTOR_COMPANY_FLAVOR.GENERAL;
      const userPrompt = buildCompanyOverviewPrompt(input, flavor);
      const result = await generateText(
        [{ role: "user", content: userPrompt }],
        {
          systemPrompt,
          maxTokens: 4096,
          temperature: 0.35,
          validate,
          logContext,
          modelChain: input.modelChain,
          taskTier: resolveTaskTierForSection(sectionKey),
          onAttempt: input.onAttempt,
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
        validate,
        logContext,
        modelChain: input.modelChain,
        taskTier: resolveTaskTierForSection(sectionKey),
        onAttempt: input.onAttempt,
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
