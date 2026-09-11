/**
 * 약한 섹션 일괄 개선 — 섹션별 순차 호출 오케스트레이션(순수 로직, 네트워크
 * 코드 없음).
 *
 * 실제 fetch/DOM 의존성은 호출부(report-page-client.tsx)에 남겨두고, 여기는
 * "다음 섹션으로 넘어갈지 / 멈출지"를 결정하는 순서·부분 실패 처리만
 * 담당한다 — 이래야 브라우저 없이도(tools/test-*.ts) 이 로직을 테스트할
 * 수 있다.
 *
 * 섹션 하나가 실패하면(네트워크 오류, rate limit, 타임아웃으로 인한
 * 빈/비-JSON 응답 등) 그 이후 섹션은 호출하지 않고 멈춘다 — 이미 완료된
 * 섹션은 호출부가 각 요청 안에서 즉시 DB에 저장했으므로 그대로 유지된다.
 */

export interface WeakSectionTarget {
  sectionKey: string;
  title: string;
  score: number;
  issues: string[];
  warnings: string[];
}

export interface SectionImproveOutcome {
  sectionKey: string;
  beforeScore: number;
  afterScore: number;
}

export type RegenerateOneSection = (
  target: WeakSectionTarget
) => Promise<{ ok: true; afterScore: number } | { ok: false; message: string }>;

export interface BatchProgress {
  done: number;
  total: number;
  currentTitle: string | null;
}

export interface BatchImproveResult {
  improved: SectionImproveOutcome[];
  /** true면 targets를 끝까지 처리하지 못하고 중간에 멈춘 것 */
  stoppedEarly: boolean;
  stopMessage: string | null;
}

/**
 * targets를 순서대로 하나씩 개선한다. 하나라도 실패하면 즉시 멈추고
 * (나머지 섹션은 호출하지 않음) 그때까지의 결과를 반환한다 — 부분 성공을
 * 오류로 취급하지 않는다.
 */
export async function runBatchImprove(
  targets: WeakSectionTarget[],
  regenerateOne: RegenerateOneSection,
  onProgress?: (progress: BatchProgress) => void
): Promise<BatchImproveResult> {
  const improved: SectionImproveOutcome[] = [];

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    onProgress?.({ done: i, total: targets.length, currentTitle: target.title });

    const result = await regenerateOne(target);
    if (!result.ok) {
      return { improved, stoppedEarly: true, stopMessage: result.message };
    }

    improved.push({
      sectionKey: target.sectionKey,
      beforeScore: target.score,
      afterScore: result.afterScore,
    });
    onProgress?.({ done: i + 1, total: targets.length, currentTitle: target.title });
  }

  return { improved, stoppedEarly: false, stopMessage: null };
}
