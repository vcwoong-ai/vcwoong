/**
 * PE Document Chunking(PR-I.1, Finding #5).
 *
 * 감사 결과: 기존 `extractPEFactsFromDocument()`는 `documentContent`
 * 전체를 잘라내지 않고 한 번에 프롬프트에 넣었다 — `evidence-ai.ts`가
 * 이미 `DOC_CONTEXT_CHARS`(8000자)로 자르는 선례가 있는데도 재사용하지
 * 않았다(그 파일은 여러 문서를 8000자로 "잘라서" 한 프롬프트에 합치는
 * 것이지, 한 문서를 "나눠서 여러 번" 호출하는 chunking은 아니다 — 확인함,
 * 재사용 가능한 chunking infra는 저장소에 없었다).
 *
 * 이 파일은 §31 요구대로 진짜 chunking을 한다(단순 절삭이 아님) — 긴
 * 문서의 뒷부분을 조용히 버리지 않고, 청크별로 추출한 뒤 병합한다.
 * 순수 함수만 있다(AI 호출 없음) — 실제 청크별 추출 호출은
 * pe-fact-extraction.ts가 담당한다.
 */

import type { FactExtractionParseResult } from "./pe-fact-validation";
import type { RawAIExtraction, RawAIExtractedFact } from "./pe-fact-types";

/** evidence-ai.ts의 DOC_CONTEXT_CHARS(8000)와 같은 값 — 검증된 기존 관례를
 * 그대로 재사용한다(임의의 새 숫자를 만들지 않음). */
export const MAX_CHUNK_CHARS = 8000;

/** 문서 하나가 만들 수 있는 최대 청크 수 — 극단적으로 큰 문서가 무한정
 * AI 호출을 만들지 않도록 하는 결정론적 상한(§16). 8000자 × 50청크 =
 * 400,000자(약 20만 단어) — 일반적인 데이터룸 문서 1건이 이 범위를 넘으면
 * 애초에 문서 분할(여러 파일로 업로드) 대상이라고 판단해 상한을 뒀다. */
export const MAX_CHUNKS = 50;

export interface PEDocumentChunk {
  index: number;
  totalChunks: number;
  content: string;
  startOffset: number;
  endOffset: number;
}

export type ChunkDocumentResult =
  | { status: "ok"; chunks: PEDocumentChunk[] }
  | { status: "document_too_large"; totalChunksWouldBe: number; maxChunks: number };

/**
 * 문서를 maxChars 단위로 겹침 없이 순서대로 나눈다 — 각 청크는
 * [startOffset, endOffset) 구간을 정확히 담아, 모든 청크의 content를
 * 이어붙이면 원본과 완전히 같다(문자 손실·중복 없음, 결정론적 경계).
 */
export function chunkDocumentContent(
  documentContent: string,
  maxChars: number = MAX_CHUNK_CHARS
): ChunkDocumentResult {
  if (documentContent.length === 0) {
    return { status: "ok", chunks: [{ index: 0, totalChunks: 1, content: "", startOffset: 0, endOffset: 0 }] };
  }

  const totalChunksWouldBe = Math.ceil(documentContent.length / maxChars);
  if (totalChunksWouldBe > MAX_CHUNKS) {
    return { status: "document_too_large", totalChunksWouldBe, maxChunks: MAX_CHUNKS };
  }

  const chunks: PEDocumentChunk[] = [];
  let offset = 0;
  while (offset < documentContent.length) {
    const end = Math.min(offset + maxChars, documentContent.length);
    chunks.push({
      index: chunks.length,
      totalChunks: totalChunksWouldBe,
      content: documentContent.slice(offset, end),
      startOffset: offset,
      endOffset: end,
    });
    offset = end;
  }
  return { status: "ok", chunks };
}

export interface MergedChunkExtraction {
  status: "ok" | "partial" | "all_failed";
  extraction: RawAIExtraction;
  /** 실패한 청크를 조용히 버리지 않고 명시한다(§5 — "never silently discard chunks"). */
  chunkFailures: Array<{ chunkIndex: number; status: string; detail: string }>;
}

/**
 * 청크별 파싱 결과(각 청크마다 한 번씩 AI를 호출한 뒤 parseFactExtractionResponse를
 * 거친 결과)를 하나의 RawAIExtraction으로 합친다. 일부 청크가 실패해도
 * 나머지 청크의 facts는 버리지 않는다 — 실패한 청크는 chunkFailures에
 * 명시적으로 남긴다.
 */
export function mergeChunkedExtractions(
  documentId: string,
  chunkResults: FactExtractionParseResult[]
): MergedChunkExtraction {
  const facts: RawAIExtractedFact[] = [];
  const chunkFailures: MergedChunkExtraction["chunkFailures"] = [];

  chunkResults.forEach((result, chunkIndex) => {
    if (result.status === "ok") {
      facts.push(...result.extraction.facts);
    } else {
      chunkFailures.push({ chunkIndex, status: result.status, detail: result.detail });
    }
  });

  const status: MergedChunkExtraction["status"] =
    chunkFailures.length === 0 ? "ok" : chunkFailures.length === chunkResults.length ? "all_failed" : "partial";

  return { status, extraction: { documentId, facts }, chunkFailures };
}
