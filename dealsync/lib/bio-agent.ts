/**
 * Dr. Cell — BIO / Healthcare Sector Agent
 *
 * Handles BIO-specific report generation logic:
 *  1. Pipeline asset table (파이프라인명 | 적응증 | 임상단계 | 예상 LoA | rNPV 기여)
 *  2. rNPV calculation when financial projections are present
 *  3. [데이터 미확인] flagging — never fabricates missing clinical data
 */

import { ReportSection } from "./report-sections";

export const DR_CELL_AGENT_NAME = "Dr. Cell";

/** Sentinel used whenever a clinical or financial value cannot be confirmed. */
export const MISSING_DATA_PLACEHOLDER = "[데이터 미확인]";

// ---------------------------------------------------------------------------
// Industry-standard LoA benchmarks — BIO/Informa Clinical Development
// Success Rates 2011-2020 (updated 2024 edition)
// ---------------------------------------------------------------------------
export const LOA_BENCHMARKS: Record<string, number> = {
  "preclinical": 0.10,
  "pre-clinical": 0.10,
  "전임상": 0.10,
  "phase 1": 0.52,
  "ph1": 0.52,
  "임상 1상": 0.52,
  "1상": 0.52,
  "phase 2": 0.28,
  "ph2": 0.28,
  "임상 2상": 0.28,
  "2상": 0.28,
  "phase 3": 0.58,
  "ph3": 0.58,
  "임상 3상": 0.58,
  "3상": 0.58,
  "nda": 0.85,
  "bla": 0.85,
  "nda/bla": 0.85,
  "허가 신청": 0.85,
  "approved": 1.00,
  "승인": 1.00,
  "시판": 1.00,
};

// Default parameters for rNPV calculation
const DEFAULT_DISCOUNT_RATE = 0.10;
const DEFAULT_ROYALTY_RATE = 0.12;
const DEFAULT_REVENUE_DURATION_YEARS = 10;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PipelineAsset {
  /** 파이프라인명 */
  pipelineName: string;
  /** 적응증 */
  indication: string;
  /** 임상단계 */
  clinicalStage: string;
  /** 예상 LoA (%, e.g. "28%") */
  expectedLoA: string;
  /** rNPV 기여 (억원 or MISSING_DATA_PLACEHOLDER) */
  rnpvContribution: string;
}

export interface RNPVParams {
  /** Peak annual sales in KRW (원) */
  peakSalesKRW: number;
  /** Clinical stage string used to look up LoA */
  clinicalStage: string;
  /** Years until commercial launch */
  yearsToLaunch: number;
  /** Royalty or net margin rate (default 12%) */
  royaltyRate?: number;
  /** Annual discount rate (default 10%) */
  discountRate?: number;
  /** Revenue duration in years (default 10) */
  revenueDurationYears?: number;
}

// ---------------------------------------------------------------------------
// Core calculations
// ---------------------------------------------------------------------------

/**
 * Returns the industry-benchmark LoA probability for a given clinical stage,
 * or null if the stage string is not recognised.
 */
export function getLoAForStage(stage: string): number | null {
  return LOA_BENCHMARKS[stage.toLowerCase().trim()] ?? null;
}

/**
 * Calculates the risk-adjusted NPV (rNPV) for a single pipeline asset.
 *
 * Formula:
 *   rNPV = (peakSales × LoA × royalty × PV_annuity_factor) / (1+r)^yearsToLaunch
 *
 * Returns null when LoA cannot be determined from `clinicalStage`.
 */
export function calculateRNPV(params: RNPVParams): number | null {
  const loa = getLoAForStage(params.clinicalStage);
  if (loa === null) return null;

  const royalty = params.royaltyRate ?? DEFAULT_ROYALTY_RATE;
  const r = params.discountRate ?? DEFAULT_DISCOUNT_RATE;
  const duration = params.revenueDurationYears ?? DEFAULT_REVENUE_DURATION_YEARS;
  const t = params.yearsToLaunch;

  // Present-value annuity factor for the revenue stream
  const pvFactor = r === 0
    ? duration
    : (1 - Math.pow(1 + r, -duration)) / r;

  const rnpv = (params.peakSalesKRW * loa * royalty * pvFactor)
    / Math.pow(1 + r, t);

  return rnpv;
}

/**
 * Formats a KRW value (원) as 억원, rounded to one decimal place.
 * Values below 1억 are expressed in 천만원.
 */
export function formatKRW(won: number): string {
  const eok = won / 1e8;
  if (eok >= 1) return `${eok.toFixed(1)}억원`;
  const chunman = won / 1e7;
  return `${chunman.toFixed(1)}천만원`;
}

// ---------------------------------------------------------------------------
// BIO-specific report section
// ---------------------------------------------------------------------------

/**
 * The pipeline analysis section is injected into the report only when the
 * detected sector is BIO / healthcare.
 */
export const BIO_PIPELINE_SECTION: ReportSection = {
  key: "bio_pipeline",
  title: "파이프라인 분석 (Dr. Cell)",
  charLimit: 2500,
  description:
    "파이프라인 자산 테이블 (파이프라인명 | 적응증 | 임상단계 | 예상 LoA | rNPV 기여) 및 rNPV 종합 추정. " +
    "문서에서 확인되지 않는 수치는 반드시 [데이터 미확인]으로 표기하고 임의로 생성하지 말 것.",
};

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

/**
 * Returns the enriched system prompt for ALL sections when Dr. Cell is active.
 * Replaces the minimal one-liner note previously used for BIO sector.
 */
export function buildDrCellSystemPrompt(sectionTitle: string, charLimit: number): string {
  return (
    `당신은 한국 벤처캐피탈 심사역 보조 AI "Dr. Cell"입니다. ` +
    `바이오/헬스케어 분야 전문 투자 분석을 수행합니다. ` +
    `투자심의보고서의 '${sectionTitle}' 섹션을 작성합니다. ` +
    `한글 1자=1.0, 영문=0.5로 계산하여 ${charLimit}자 이내로 작성하세요. ` +
    `\n\n[Dr. Cell 핵심 원칙]\n` +
    `1. rNPV, LoA, 임상 단계 등 바이오 특화 지표를 우선적으로 분석하세요.\n` +
    `2. 문서에서 확인되지 않는 임상 데이터나 재무 수치는 반드시 ${MISSING_DATA_PLACEHOLDER} 으로 표기하세요.\n` +
    `3. 절대로 임상 결과, 파이프라인 상태, 재무 수치를 임의로 추정하거나 만들어내지 마세요.\n` +
    `4. 전문적이고 객관적인 한국어로 작성하세요.`
  );
}

/**
 * Returns the specialised user prompt for the pipeline table section.
 * Instructs the model to extract assets, apply LoA benchmarks, and flag gaps.
 */
export function buildPipelineUserPrompt(extractedText: string): string {
  const loaTable = Object.entries(LOA_BENCHMARKS)
    .filter(([key]) => !key.includes("/"))
    .map(([stage, loa]) => `  - ${stage}: ${(loa * 100).toFixed(0)}%`)
    .join("\n");

  return (
    `다음 자료에서 파이프라인(신약 후보물질, 의료기기, 진단제 등)을 추출하여 분석하세요.\n\n` +
    `--- 자료 시작 ---\n${extractedText.slice(0, 10000)}\n--- 자료 끝 ---\n\n` +
    `[작성 지침 — Dr. Cell 파이프라인 분석]\n` +
    `\n1. 아래 마크다운 테이블 형식으로 파이프라인을 정리하세요:\n` +
    `   | 파이프라인명 | 적응증 | 임상단계 | 예상 LoA | rNPV 기여 |\n` +
    `   |---|---|---|---|---|\n\n` +
    `2. 임상단계별 업계 표준 LoA (BIO/Informa 2024 기준):\n` +
    `${loaTable}\n\n` +
    `3. rNPV 기여 계산 (재무 정보가 문서에 제시된 경우에만):\n` +
    `   rNPV ≈ (피크매출 × LoA × 로열티율 × PV_연금계수) / (1+r)^출시예상연수\n` +
    `   - 기본 할인율(r): 10%  |  기본 로열티율: 12%  |  기본 매출 지속 기간: 10년\n\n` +
    `4. 확인되지 않는 항목은 반드시 ${MISSING_DATA_PLACEHOLDER} 으로 표기하세요. 수치를 임의로 생성하지 마세요.\n\n` +
    `5. 파이프라인 테이블 아래에 rNPV 종합 추정 요약을 작성하세요 (재무 데이터가 있을 경우).\n\n` +
    `출력 형식(JSON만 출력):\n` +
    `{"title": "파이프라인 분석 (Dr. Cell)", "content": "마크다운 테이블 및 rNPV 추정 (2500자 이내)", "keyPoints": ["핵심 포인트 1", "핵심 포인트 2", "핵심 포인트 3"]}`
  );
}
