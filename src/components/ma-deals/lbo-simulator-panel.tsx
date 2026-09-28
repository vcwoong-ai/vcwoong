"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { calculateLboModel, type LboAssumptions } from "@/lib/lbo-model";
import type { FinancialCalcResult } from "@/lib/pe/financial-types";

/**
 * 클라이언트에서 순수 함수(calculateLboModel)를 직접 호출한다 — 네트워크
 * 호출도 AI 호출도 없다. 입력이 바뀔 때마다 결정론적으로 재계산될 뿐이라
 * "AI가 숫자를 계산하지 않는다"는 PE 엔진 원칙을 그대로 유지한다.
 */

const DEFAULT_ASSUMPTIONS: LboAssumptions = {
  entryEbitda: 50,
  entryMultiple: 8,
  debtToEbitda: 5,
  interestRate: 8,
  ebitdaGrowthRate: 10,
  fcfConversionRate: 60,
  cashSweepRate: 100,
  exitMultiple: 8,
  holdPeriodYears: 3,
};

const FIELDS: Array<{
  key: keyof LboAssumptions;
  label: string;
  suffix: string;
  step?: string;
}> = [
  { key: "entryEbitda", label: "인수 시점 EBITDA", suffix: "억원" },
  { key: "entryMultiple", label: "인수 배수 (EV/EBITDA)", suffix: "x", step: "0.1" },
  { key: "debtToEbitda", label: "레버리지 (Debt/EBITDA)", suffix: "x", step: "0.1" },
  { key: "interestRate", label: "부채 이자율", suffix: "%", step: "0.1" },
  { key: "ebitdaGrowthRate", label: "연간 EBITDA 성장률", suffix: "%", step: "0.1" },
  { key: "fcfConversionRate", label: "EBITDA→FCF 전환율", suffix: "%", step: "0.1" },
  { key: "cashSweepRate", label: "캐시 스윕 비율", suffix: "%", step: "0.1" },
  { key: "exitMultiple", label: "Exit 배수", suffix: "x", step: "0.1" },
  { key: "holdPeriodYears", label: "보유 기간", suffix: "년" },
];

function formatEok(n: number): string {
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}억원`;
}

export function LboSimulatorPanel({
  initialEbitda,
  initialEbitdaInEok,
}: {
  /** 재무 탭에 이미 데이터가 있으면 인수 EBITDA 초기값으로 참고만 한다(자동 계산 아님) */
  initialEbitda?: FinancialCalcResult;
  /** QoE(승인된 조정만 반영) → LBO 브릿지가 이미 억원으로 환산해둔 값 — 있으면 initialEbitda보다 우선한다(§9 IC 스냅샷과 같은 숫자를 그대로 이어받기 위함, 여기서 다시 계산하지 않음) */
  initialEbitdaInEok?: number;
}) {
  const [assumptions, setAssumptions] = useState<LboAssumptions>(() => ({
    ...DEFAULT_ASSUMPTIONS,
    entryEbitda:
      initialEbitdaInEok !== undefined
        ? initialEbitdaInEok
        : initialEbitda?.status === "ok"
          ? Math.round((initialEbitda.value / 100_000_000) * 10) / 10
          : DEFAULT_ASSUMPTIONS.entryEbitda,
  }));

  const result = useMemo(() => calculateLboModel(assumptions), [assumptions]);

  const setField = (key: keyof LboAssumptions, raw: string) => {
    const value = parseFloat(raw);
    setAssumptions((prev) => ({ ...prev, [key]: Number.isFinite(value) ? value : 0 }));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">가정 입력</CardTitle>
          <p className="text-xs text-gray-400">
            단순화 모델입니다 — 부채는 단일 트랜치, EBITDA→FCF 전환은 비율 하나로
            단순화, 인수 수수료 미반영. 실사 전 개략 가늠용입니다.
          </p>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3">
          {FIELDS.map((f) => (
            <div key={f.key} className="space-y-1.5">
              <Label className="text-xs">
                {f.label} ({f.suffix})
              </Label>
              <Input
                type="number"
                step={f.step ?? "1"}
                value={assumptions[f.key]}
                onChange={(e) => setField(f.key, e.target.value)}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">결과</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {result.moic === null ? (
            <p className="text-sm text-amber-600">
              입력값으로는 계산할 수 없습니다(EBITDA·배수·보유기간은 0보다 커야 합니다).
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-gray-400">Entry EV</p>
                  <p className="font-medium">{formatEok(result.entryEv)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Entry Equity</p>
                  <p className="font-medium">{formatEok(result.entryEquity)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Exit EV</p>
                  <p className="font-medium">{formatEok(result.exitEv)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">Exit Equity</p>
                  <p className="font-medium">{formatEok(result.exitEquity)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">MOIC</p>
                  <p className="font-semibold text-blue-600">{result.moic.toFixed(2)}x</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">IRR</p>
                  <p className="font-semibold text-blue-600">
                    {result.irr !== null ? `${(result.irr * 100).toFixed(1)}%` : "—"}
                  </p>
                </div>
              </div>

              <div>
                <p className="text-xs text-gray-400 mb-2">연도별 부채 상환 스케줄</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-400 border-b">
                        <th className="text-left py-1 pr-2">연도</th>
                        <th className="text-right py-1 px-2">EBITDA</th>
                        <th className="text-right py-1 px-2">FCF</th>
                        <th className="text-right py-1 pl-2">기말 부채</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.yearlySchedule.map((y) => (
                        <tr key={y.year} className="border-b last:border-0">
                          <td className="py-1 pr-2">{y.year}</td>
                          <td className="text-right py-1 px-2">{formatEok(y.ebitda)}</td>
                          <td className="text-right py-1 px-2">{formatEok(y.freeCashFlow)}</td>
                          <td className="text-right py-1 pl-2">{formatEok(y.endingDebt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
