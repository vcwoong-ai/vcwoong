import { randomUUID } from "node:crypto";
import { AgentType, DealSector } from "@prisma/client";
import { SECTION_META } from "../../src/types";
import { generateMockContent } from "../../src/lib/mock-generator";
import { checkGenerationGate } from "../../src/lib/section-generation-gate";
import { buildSectionPrompt } from "../../src/prompts/section-prompts";
import { buildCompanyOverviewPrompt, SECTOR_COMPANY_FLAVOR } from "../../src/agents/overview-helpers";
import { syntheticSection } from "./synthetic-generation";

/** Contains only freshly generated synthetic identities and text, never customer inputs. */
export function freeCustomerFixture() {
  const prefix = `e2e-free-${randomUUID()}`;
  const companyName = `${prefix} 합성기업`;
  return {
    prefix, companyName, name: "신규 고객 합성 검사", email: `${prefix}@example.com`,
    password: `${randomUUID()}aA1!`, fileName: `${prefix}.txt`,
    deal: { name: prefix, companyName, sector: DealSector.GENERAL, investRound: "Series A", investAmount: 10, valuation: 100, shareWithTeam: false },
    text: `${companyName}\n이 문서는 합성 테스트 자료입니다. 실제 고객·투자 사실이 아닙니다.\n투자금액 10억원, 기업가치 100억원. 제품은 합성 업무 도구이며 매출과 시장 규모는 확인되지 않았습니다.`,
  };
}

export function assessDemoMockGate(synthetic = false) {
  const fixture = freeCustomerFixture();
  const input = { dealId: fixture.prefix, agentType: AgentType.GENERAL, ...fixture.deal, documents: [{ name: fixture.fileName, parsedText: fixture.text }] };
  return SECTION_META.map(meta => {
    const prompt = meta.key === "COMPANY_OVERVIEW"
      ? buildCompanyOverviewPrompt(input, SECTOR_COMPANY_FLAVOR.GENERAL)
      : buildSectionPrompt(meta.key, { ...fixture.deal, documentContext: fixture.text });
    const messages = [{ role: "user" as const, content: prompt }];
    const content = synthetic ? syntheticSection(messages, { logContext: { section: meta.key } }).content : generateMockContent(messages);
    return { section: meta.key, demoNotice: content.includes("데모 모드"), ...checkGenerationGate(meta.key, content) };
  });
}

/** These checks belong in an explicitly opened browser, not in this API-only CLI. */
export const MANUAL_BROWSER_CHECKS = [
  "Register one new FREE customer through /register?track=vc; confirm session and dashboard onboarding.",
  "Use the first-deal CTA and actual form to create a GENERAL deal; upload the synthetic TXT via the visible dropzone.",
  "Generate one report without a template; confirm progress, ten sections and demo labeling (no provider credentials).",
  "Edit a section, reload, review source/uncertainty and approve; confirm the persisted text and approval in the UI.",
  "Click DOCX and PPTX export controls; inspect downloaded content and verify edited text plus demo labeling.",
  "Log out, close the browser session, log in again and reopen the same report; inspect mobile keyboard focus and error feedback.",
] as const;
