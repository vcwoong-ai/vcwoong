import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import { ReadinessBadge } from "./readiness-badge";
import type { PEDecisionDomainResult } from "@/lib/pe/pe-decision-readiness";
import type { PEDDCase } from "@/lib/pe/dd-types";

/**
 * Evidence / Data Room 상태(PR #107). 두 가지를 구분해서 보여준다(§11 —
 * "evidence 존재"와 "claim이 근거로 뒷받침됨"은 다른 질문이다):
 * - 실제로 저장된 근거 재고(evidence/source 건수) — ddCase.lineage에서
 *   그대로 센 값(새 검증 아님, 배열 길이일 뿐).
 * - EVIDENCE readiness 도메인(pe-decision-readiness.ts, 수정 없음)의
 *   판정 — "기록된 claim이 근거로 뒷받침되는가"를 엔진이 이미 판정한 결과를
 *   그대로 보여준다. 지금은 PEClaim을 생성하는 경로가 없어(PR #105 audit)
 *   claim 수가 0이라 이 도메인은 대개 NOT_STARTED로 나온다 — 이것이 "근거가
 *   하나도 없다"는 뜻이 아니라는 걸 위 재고 숫자와 나란히 보여줘서 오해를
 *   막는다.
 */
export function MaDealEvidenceStatus({
  ddCase,
  evidenceDomain,
  onOpenDataRoom,
}: {
  ddCase: PEDDCase | undefined;
  evidenceDomain: PEDecisionDomainResult;
  onOpenDataRoom: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">근거(Evidence) 상태</CardTitle>
        <Button variant="ghost" size="sm" onClick={onOpenDataRoom}>
          데이터룸 열기
          <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {!ddCase ? (
          <p className="text-sm text-gray-400">DD/근거 데이터가 아직 연결되지 않았습니다.</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-xs text-gray-400">저장된 근거(evidence)</p>
              <p className="font-medium">{ddCase.lineage.evidence.length}건</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">출처(source)</p>
              <p className="font-medium">{ddCase.lineage.sources.length}건</p>
            </div>
            <div>
              <p className="text-xs text-gray-400">문서에 연결된 재무기간</p>
              <p className="font-medium">{ddCase.lineage.periods.length}개</p>
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 border-t pt-3">
          <ReadinessBadge state={evidenceDomain.status} />
          <p className="text-xs text-gray-500">{evidenceDomain.reason}</p>
        </div>
      </CardContent>
    </Card>
  );
}
