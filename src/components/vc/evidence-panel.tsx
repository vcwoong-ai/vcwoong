"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FileText, X } from "lucide-react";
import { useEffect, useState, type MutableRefObject } from "react";
import { cn } from "@/lib/utils";

const SCENARIO_LABEL = { ACTUAL: "실적", FORECAST: "추정", UNSPECIFIED: "명시 없음" } as const;

/** 근거 패널이 보여주는 값 하나 — canonical 결정(evidence.ts의 claim)에 이미 있는 필드만 담는다. */
export interface EvidenceEntry {
  /** 보고서에 쓰인 표기("95억원") */
  raw: string;
  documentName?: string;
  location?: string;
  period?: string;
  scenario?: keyof typeof SCENARIO_LABEL;
  unit?: string;
  /** 원문 발췌 — 없으면 없다고 표시하고 추정하지 않는다 */
  snippet?: string;
}

export interface EvidenceTarget {
  /** 무엇에 대한 근거인가(예: "2024년 매출 — 수치 상충") */
  heading: string;
  /** 처음 열 값의 위치 */
  activeIndex: number;
  entries: EvidenceEntry[];
  /** 항상 같이 보여줄 설명(영향받는 판단, 필요한 검증 등) */
  notes?: Array<{ label: string; text: string }>;
}

/**
 * 근거 확인 패널.
 * 데스크톱은 오른쪽에 붙는 패널, 모바일은 아래에서 올라오는 드로어 — 같은 내용을 같은 컴포넌트가 그린다.
 * 모달(포커스 가둠·ESC로 닫기·닫으면 누른 버튼으로 초점 복귀)이라 키보드로 열고 닫을 수 있다.
 * 새 원문 조회를 하지 않는다: 이미 결정 응답에 들어 있는 발췌·문서명·위치·기간만 보여주고,
 * 없는 것은 "없음"으로 표시한다(원문 뷰어가 있는 것처럼 보이게 하지 않는다).
 */
export function EvidencePanel({
  target,
  onClose,
  returnFocusRef,
}: {
  target: EvidenceTarget | null;
  onClose: () => void;
  /** 패널을 연 버튼 — 닫으면 이 요소로 초점을 돌려준다(키보드 사용자가 자리를 잃지 않게) */
  returnFocusRef?: MutableRefObject<HTMLElement | null>;
}) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (target) setIndex(target.activeIndex);
  }, [target]);

  const entry = target?.entries[index];

  return (
    <DialogPrimitive.Root open={target != null} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/30 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          data-testid="vc-evidence-panel"
          aria-describedby={undefined}
          onCloseAutoFocus={(event) => {
            if (returnFocusRef?.current) {
              event.preventDefault();
              returnFocusRef.current.focus();
            }
          }}
          className={cn(
            "fixed z-50 flex flex-col bg-card shadow-xl focus:outline-none",
            // 모바일: 아래 드로어
            "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-xl border-t border-border",
            // 데스크톱: 오른쪽 패널
            "md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:max-h-none md:w-[440px] md:rounded-none md:border-l md:border-t-0"
          )}
        >
          <header className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">근거 확인</p>
              <DialogPrimitive.Title className="mt-1 text-base font-semibold text-foreground">
                {target?.heading}
              </DialogPrimitive.Title>
            </div>
            <DialogPrimitive.Close
              className="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="근거 패널 닫기"
            >
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {target && target.entries.length > 1 && (
              <div role="tablist" aria-label="상충하는 값" className="flex flex-wrap gap-2">
                {target.entries.map((e, i) => (
                  <button
                    key={`${e.raw}-${i}`}
                    role="tab"
                    type="button"
                    aria-selected={i === index}
                    onClick={() => setIndex(i)}
                    className={cn(
                      "rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors",
                      i === index
                        ? "border-primary bg-primary/5 text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className="block font-semibold tabular-nums">{e.raw}</span>
                    <span className="block max-w-[10rem] truncate">{e.documentName ?? "출처 미표기"}</span>
                  </button>
                ))}
              </div>
            )}

            {entry && (
              <section aria-label="선택한 값" data-testid="vc-evidence-entry">
                <p className="text-2xl font-semibold tabular-nums text-foreground">{entry.raw}</p>
                <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                  <dt className="text-muted-foreground">문서</dt>
                  <dd className="text-foreground">{entry.documentName ?? "출처 미표기"}</dd>
                  <dt className="text-muted-foreground">위치</dt>
                  <dd className="text-foreground">{entry.location ?? "위치 정보 없음"}</dd>
                  {entry.period !== undefined && (
                    <>
                      <dt className="text-muted-foreground">기간</dt>
                      <dd className="text-foreground">{entry.period === "UNSPECIFIED" ? "명시 없음" : entry.period}</dd>
                    </>
                  )}
                  {entry.scenario !== undefined && (
                    <>
                      <dt className="text-muted-foreground">구분</dt>
                      <dd className="text-foreground">{SCENARIO_LABEL[entry.scenario]}</dd>
                    </>
                  )}
                  {entry.unit && (
                    <>
                      <dt className="text-muted-foreground">단위</dt>
                      <dd className="text-foreground">{entry.unit}</dd>
                    </>
                  )}
                </dl>

                <h3 className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  원문 발췌
                </h3>
                {entry.snippet ? (
                  <blockquote className="mt-1.5 whitespace-pre-wrap rounded-md border-l-2 border-primary bg-muted/60 px-3 py-2 text-sm leading-relaxed text-foreground">
                    {entry.snippet}
                  </blockquote>
                ) : (
                  <p className="mt-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground">
                    이 값의 원문 발췌가 저장돼 있지 않습니다. 위 문서·위치에서 직접 확인하십시오.
                  </p>
                )}
              </section>
            )}

            {target && target.entries.length > 1 && (
              <section aria-label="값 비교">
                <h3 className="text-xs font-semibold text-muted-foreground">모든 값 나란히 보기</h3>
                <ul className="mt-1.5 divide-y divide-border rounded-md border border-border text-sm">
                  {target.entries.map((e, i) => (
                    <li key={`${e.raw}-${i}`} className="flex items-baseline justify-between gap-3 px-3 py-2">
                      <span className="min-w-0 truncate text-muted-foreground">{e.documentName ?? "출처 미표기"}</span>
                      <span className="shrink-0 font-semibold tabular-nums text-foreground">
                        {e.raw}
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          {e.period && e.period !== "UNSPECIFIED" ? e.period : ""}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs text-muted-foreground">
                  어느 값이 맞는지는 시스템이 고르지 않습니다. 원문 대조로 확정하십시오.
                </p>
              </section>
            )}

            {target?.notes && target.notes.length > 0 && (
              <dl className="space-y-2 border-t border-border pt-4 text-sm">
                {target.notes.map((n) => (
                  <div key={n.label}>
                    <dt className="text-xs font-medium text-muted-foreground">{n.label}</dt>
                    <dd className="mt-0.5 text-foreground">{n.text}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
