"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Zap, ArrowRight } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { calculateSimpleIrr } from "@/lib/irr-calculator";

export function IrrCalculatorClient() {
  const [investAmount, setInvestAmount] = useState("10");
  const [exitAmount, setExitAmount] = useState("50");
  const [years, setYears] = useState("5");

  const result = useMemo(
    () =>
      calculateSimpleIrr({
        investAmount: Number(investAmount) || 0,
        exitAmount: Number(exitAmount) || 0,
        years: Number(years) || 0,
      }),
    [investAmount, exitAmount, years]
  );

  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="text-lg font-bold text-gray-900">{BRAND.name}</span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              로그인
            </Link>
            <Link
              href="/register"
              className="bg-blue-600 text-white text-sm px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              무료 시작
            </Link>
          </div>
        </div>
      </nav>

      <section className="pt-32 pb-24 px-6">
        <div className="max-w-lg mx-auto">
          <div className="text-center mb-10">
            <h1 className="text-3xl font-bold text-gray-900">무료 IRR 계산기</h1>
            <p className="text-gray-500 mt-3">
              투자금과 예상 회수금만 입력하면 IRR(내부수익률)과 투자 배수를
              즉시 계산합니다. 로그인 불필요.
            </p>
          </div>

          <div className="bg-gray-50 rounded-2xl border border-gray-100 p-6 space-y-5">
            <div>
              <label className="text-sm font-medium text-gray-700">
                투자금 (억원)
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={investAmount}
                onChange={(e) => setInvestAmount(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                예상 회수금 (억원)
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={exitAmount}
                onChange={(e) => setExitAmount(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">
                투자 기간 (년)
              </label>
              <input
                type="number"
                inputMode="decimal"
                value={years}
                onChange={(e) => setYears(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-gray-200 px-3 py-2.5 text-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="border-t border-gray-200 pt-5 text-center">
              {result.irr === null ? (
                <p className="text-gray-400 text-sm">
                  투자금과 기간을 0보다 크게 입력해주세요
                </p>
              ) : (
                <>
                  <p className="text-4xl font-bold text-blue-600">
                    {(result.irr * 100).toFixed(1)}%
                  </p>
                  <p className="text-sm text-gray-500 mt-1">예상 수익률 (IRR)</p>
                  <p className="text-sm text-gray-600 mt-3">
                    투자 원금 대비{" "}
                    <span className="font-semibold">{result.multiple.toFixed(1)}배</span> 수익
                  </p>
                </>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-400 mt-4 text-center">
            투자·회수가 각 1회씩만 발생한다고 가정한 단순 연복리 환산입니다.
            분할 투자·중간 회수가 있는 실제 딜은 날짜별 현금흐름 기반 XIRR이
            더 정확합니다.
          </p>

          <div className="mt-10 text-center">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-6 py-3 rounded-xl transition-colors"
            >
              실제 딜로 투자심의보고서 만들어보기
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
