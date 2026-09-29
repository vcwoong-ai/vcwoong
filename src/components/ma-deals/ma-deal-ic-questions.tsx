import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ICQuestion, ICQuestionSourceType } from "@/lib/pe/pe-ic-questions";

const SOURCE_LABEL: Record<ICQuestionSourceType, string> = {
  BLOCKER: "모순/차단",
  FACT_CONFLICT: "재무 데이터 충돌",
  MISSING_INFO: "정보 누락",
  DD_FINDING: "DD finding",
};

const SOURCE_VARIANT: Record<ICQuestionSourceType, "default" | "secondary" | "destructive" | "outline"> = {
  BLOCKER: "destructive",
  FACT_CONFLICT: "destructive",
  MISSING_INFO: "secondary",
  DD_FINDING: "outline",
};

/**
 * IC Questions(PR #107) — pe-ic-questions.ts의 buildICQuestions() 결과를
 * 그대로 나열한다. 모든 질문은 배지로 표시된 출처(BLOCKER/FACT_CONFLICT/
 * MISSING_INFO/DD_FINDING) 중 하나에서 결정론적으로 파생됐다 — 여기서
 * 새 질문을 만들거나 문구를 재해석하지 않는다.
 */
export function MaDealIcQuestions({ questions }: { questions: ICQuestion[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">IC 확인 질문</CardTitle>
        <p className="text-xs text-gray-500">
          아래 질문은 전부 readiness 엔진의 모순/누락 정보 또는 실제 DD finding에서 결정론적으로 파생됐습니다(AI가 임의로 만든 질문이 아닙니다).
        </p>
      </CardHeader>
      <CardContent>
        {questions.length === 0 ? (
          <p className="text-sm text-gray-400">지금 확인이 필요한 질문이 없습니다.</p>
        ) : (
          <ol className="space-y-3">
            {questions.map((q) => (
              <li key={q.code} className="border rounded-md px-3 py-2 space-y-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge variant={SOURCE_VARIANT[q.sourceType]} className="text-[10px]">
                    {SOURCE_LABEL[q.sourceType]}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    {q.domainLabel}
                  </Badge>
                </div>
                <p className="text-sm font-medium">{q.question}</p>
                <p className="text-xs text-gray-500">
                  <span className="text-gray-400">왜 중요한가:</span> {q.whyItMatters}
                </p>
                <p className="text-xs text-gray-500">
                  <span className="text-gray-400">필요한 근거:</span> {q.requiredEvidence}
                </p>
                <p className="text-xs text-gray-500">
                  <span className="text-gray-400">영향:</span> {q.decisionImpact}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
