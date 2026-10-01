"use client";

import { useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

/**
 * 랜딩 히어로의 제품 미리보기 — 실제 앱의 결정 화면(VC)·검토 상황(PE)과 같은 구성과 같은 컴포넌트 톤으로 그린다.
 * 값은 전부 "예시 데이터"이며 실존 기업·실제 고객·실제 성과가 아니다. 화면 위에 그 사실을 항상 표시한다.
 * 미리보기는 정적이다 — 눌러서 동작하는 것처럼 보이는 버튼을 만들지 않는다(탭 전환만 실제로 동작).
 */
type Track = "vc" | "pe";

export function ProductPreview() {
  const [track, setTrack] = useState<Track>("vc");
  return (
    <figure className="w-full" data-testid="landing-product-preview">
      <div role="tablist" aria-label="제품 화면 예시" className="mb-3 inline-flex rounded-lg border border-border bg-card p-0.5 text-sm">
        {([
          ["vc", "VC · 투자 판단"],
          ["pe", "PE/M&A · 검토 상황"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            type="button"
            aria-selected={track === key}
            tabIndex={track === key ? 0 : -1}
            id={`preview-tab-${key}`}
            aria-controls="preview-panel"
            onKeyDown={(event) => {
              if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
              event.preventDefault();
              const next = event.key === "Home" ? "vc" : event.key === "End" ? "pe" : track === "vc" ? "pe" : "vc";
              setTrack(next);
              document.getElementById(`preview-tab-${next}`)?.focus();
            }}
            onClick={() => setTrack(key)}
            className={cn(
              "rounded-md px-3.5 py-1.5 font-medium transition-colors",
              track === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div id="preview-panel" role="tabpanel" aria-labelledby={`preview-tab-${track}`} className="rounded-xl border border-border bg-card shadow-[0_1px_2px_rgba(23,33,47,0.06),0_12px_32px_-12px_rgba(23,33,47,0.18)]">
        <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/60 px-4 py-2 text-xs text-muted-foreground">
          <span>{track === "vc" ? "보고서 · 결정 화면" : "PE/M&A 딜 · 개요"}</span>
          <span className="rounded border border-state-caution-line bg-state-caution-bg px-1.5 py-0.5 font-medium text-state-caution">
            예시 데이터 · 가상의 회사
          </span>
        </div>
        {track === "vc" ? <VcExample /> : <PeExample />}
      </div>
      <figcaption className="mt-3 text-xs text-muted-foreground">
        검토 흐름을 축약한 미리보기입니다. 회사·수치·문서명은 설명용 예시이며 실제 고객 데이터가 아닙니다.
      </figcaption>
    </figure>
  );
}

function VcExample() {
  return (
    <div className="space-y-4 p-5" data-testid="landing-preview-vc">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Investment Decision</p>
        <p className="mt-1 text-base font-semibold text-foreground">
          예시바이오 <span className="text-sm font-normal text-muted-foreground">바이오 · Series B</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xl font-semibold text-state-caution">CAUTION</span>
        <StatusBadge tone="critical">상충</StatusBadge>
        <StatusBadge tone="caution">필수 정보 공백 2건</StatusBadge>
      </div>
      <p className="text-sm leading-relaxed text-foreground">
        투자 논지는 임상 2상 결과에 근거합니다. 1건의 수치 상충(2024년 매출)이 있어 재무 건전성 근거는 논지에서 제외했고, 정본 확인 전에는
        해당 지표를 결정에 사용할 수 없습니다.
      </p>

      <div className="overflow-hidden rounded-md border border-state-critical-line">
        <div className="flex items-center gap-2 border-b border-state-critical-line bg-state-critical-bg px-3 py-2">
          <AlertTriangle className="h-3.5 w-3.5 text-state-critical" aria-hidden="true" />
          <p className="text-sm font-semibold text-foreground">2024년 매출 — 2개 값 상충</p>
        </div>
        <table className="w-full text-sm">
          <caption className="sr-only">예시: 2024년 매출 상충 값 비교</caption>
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted-foreground">
              <th scope="col" className="px-3 py-1.5 font-medium">출처</th>
              <th scope="col" className="px-3 py-1.5 text-right font-medium">값</th>
              <th scope="col" className="px-3 py-1.5 font-medium">기간</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border">
              <th scope="row" className="px-3 py-2 text-left font-medium text-foreground">IR_Deck_예시.pdf</th>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">95억원</td>
              <td className="px-3 py-2 text-muted-foreground">FY2024</td>
            </tr>
            <tr>
              <th scope="row" className="px-3 py-2 text-left font-medium text-foreground">재무제표_예시.pdf</th>
              <td className="px-3 py-2 text-right font-semibold tabular-nums text-foreground">110억원</td>
              <td className="px-3 py-2 text-muted-foreground">FY2024</td>
            </tr>
          </tbody>
        </table>
        <p className="flex items-center gap-1 border-t border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          어느 값이 맞는지는 시스템이 고르지 않습니다 — 원문 발췌를 열어 대조합니다.
          <ArrowRight className="h-3 w-3 shrink-0" aria-hidden="true" />
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-xs font-medium text-muted-foreground">필수 정보</dt>
        <dd className="text-foreground">고객사별 계약 명세 · 현금 잔액 기준일</dd>
        <dt className="text-xs font-medium text-muted-foreground">IC 질문</dt>
        <dd className="text-foreground">어느 매출 값이 정본이며, 차이(15억원)의 원인은 무엇입니까?</dd>
      </dl>
    </div>
  );
}

function PeExample() {
  return (
    <div className="space-y-4 p-5" data-testid="landing-preview-pe">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">검토 상황</p>
          <p className="mt-1 text-base font-semibold text-foreground">
            예시정밀 <span className="text-sm font-normal text-muted-foreground">바이아웃 · 재무 기준 FY2024</span>
          </p>
        </div>
        <StatusBadge tone="critical">차단됨(모순 확인 필요)</StatusBadge>
      </div>
      <p className="text-sm leading-relaxed text-foreground">3건의 데이터 모순으로 분석 신뢰도가 확보되지 않았습니다.</p>

      <div className="rounded-md border border-border">
        <p className="border-b border-border px-3 py-2 text-sm font-semibold text-state-critical">차단 요인 — 값을 임의로 선택하지 않았습니다</p>
        <div className="px-3 py-2.5">
          <p className="text-sm font-medium text-foreground">
            <span className="mr-1.5 text-xs font-normal text-muted-foreground">재무</span>매출액 값 불일치
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            같은 기간의 매출액(KRW)에 서로 다른 값이 존재합니다: 1,200억원(경영진 제공), 1,180억원(DART)
          </p>
        </div>
      </div>

      <dl className="grid grid-cols-4 gap-2 text-xs">
        {[
          ["재무", "차단됨", "critical"],
          ["QoE", "차단됨", "critical"],
          ["LBO", "차단됨", "critical"],
          ["실사(DD)", "부분 준비", "info"],
        ].map(([label, state, tone]) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-0.5">
              <StatusBadge tone={tone as "critical" | "info"} icon={false} className="w-full justify-center">
                {state}
              </StatusBadge>
            </dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm">
        <StatusBadge tone="info" icon={false}>다음 행동</StatusBadge>
        <span className="text-foreground">차단 요인 해소: 매출액 값 불일치 → 재무 · QoE 탭</span>
      </div>
    </div>
  );
}
