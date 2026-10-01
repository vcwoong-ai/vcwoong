import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";

const GUIDES = {
  vc: {
    title: "VC — 첫 투자 검토",
    description: "회사와 딜을 등록하고, 보고서에서 투자 논지와 수치 근거를 확인하세요.",
    steps: [
      ["딜 만들기", "회사명, 딜 이름, 섹터를 입력합니다."],
      ["자료 올리기", "딜 상세에서 IR 등 검토할 문서를 업로드합니다."],
      ["보고서 생성 후 검토", "보고서를 생성한 뒤 결정 화면에서 근거, 수치 상충, 미확인 정보를 확인합니다."],
    ],
  },
  pe: {
    title: "PE/M&A — 첫 인수 검토",
    description: "인수 대상과 재무 기간을 등록하고, 검토에 부족한 입력부터 확인하세요.",
    steps: [
      ["딜 만들기", "회사명, 딜 이름, 거래 유형을 입력합니다."],
      ["재무 입력하기", "딜 상세의 재무 · QoE 탭에서 재무 기간과 계정을 추가합니다. 지원되는 공시 기업은 DART 가져오기를 사용할 수 있습니다."],
      ["준비 상태 확인", "IC 의사결정에서 차단 요인, 상충 수치, 미확인 정보와 질문을 검토합니다. 준비 상태는 투자 승인이 아닙니다."],
    ],
  },
} as const;

/** Navigation guidance only: no decision, quota or readiness computation. */
export function FirstDealGuide({ track, action, headingLevel = 2 }: {
  track: keyof typeof GUIDES;
  action: ReactNode;
  headingLevel?: 2 | 3;
}) {
  const guide = GUIDES[track];
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <Card className="min-w-0 p-5 sm:p-6" data-testid="first-deal-guide">
      <p className="text-xs font-semibold tracking-widest text-muted-foreground">START YOUR FIRST DEAL</p>
      <Heading className="mt-2 text-lg font-semibold text-foreground">{guide.title}</Heading>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{guide.description}</p>
      <ol className="my-6 space-y-4">
        {guide.steps.map(([title, description], index) => (
          <li key={title} className="flex min-w-0 gap-3">
            <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{index + 1}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
            </div>
          </li>
        ))}
      </ol>
      {action}
      <p className="mt-3 text-xs leading-5 text-muted-foreground">딜을 만든 뒤에도 자료 입력과 검토가 필요합니다.</p>
    </Card>
  );
}
