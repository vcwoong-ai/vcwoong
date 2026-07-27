"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Markdown } from "@/components/ui/markdown";
import { BRAND } from "@/lib/brand";

interface PrintReport {
  id: string;
  title: string;
  agentType: string;
  generatedAt: string | null;
  deal: { companyName: string; sector: string; investRound: string | null };
  sections: Array<{ id: string; title: string; content: string; order: number }>;
}

export function PrintReportClient({ report }: { report: PrintReport }) {
  // 인쇄 대화상자를 자동으로 띄워 "PDF로 저장"까지 한 번에 이어지게 한다
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <style>{`
        @page {
          size: A4;
          margin: 18mm 16mm;
        }
        @media print {
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
          .print-section { break-inside: avoid-page; }
          .print-break { break-before: page; }
        }
      `}</style>

      <div className="no-print sticky top-0 z-10 bg-white border-b px-6 py-3 flex items-center justify-between">
        <div className="text-sm text-gray-600">
          인쇄 대화상자에서 <strong>대상: PDF로 저장</strong>을 선택하세요.
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            인쇄 / PDF 저장
          </button>
          <Link
            href={`/reports/${report.id}`}
            className="text-sm border px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            편집으로 돌아가기
          </Link>
        </div>
      </div>

      <div className="print-page max-w-[210mm] mx-auto bg-white shadow-sm my-6 p-12">
        {/* 표지 */}
        <div className="text-center py-20 border-b">
          <p className="text-xs tracking-widest text-gray-400 uppercase">
            {BRAND.name}
          </p>
          <h1 className="text-3xl font-bold text-gray-900 mt-6">
            투자심의보고서
          </h1>
          <p className="text-xl text-gray-800 mt-4">
            {report.deal.companyName}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            {report.deal.sector}
            {report.deal.investRound ? ` · ${report.deal.investRound}` : ""}
          </p>
          <p className="text-xs text-gray-400 mt-8">
            {report.generatedAt
              ? new Date(report.generatedAt).toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })
              : ""}
            {" · "}
            {report.agentType} Agent
          </p>
          <p className="text-[11px] text-gray-400 mt-10">
            대외비 — 본 문서는 투자심의를 위한 내부 자료입니다.
          </p>
        </div>

        {/* 목차 */}
        <div className="py-8 border-b print-section">
          <h2 className="text-base font-bold text-gray-900 mb-3">목차</h2>
          <ol className="space-y-1 text-sm text-gray-700">
            {report.sections.map((s, i) => (
              <li key={s.id} className="flex justify-between">
                <span>
                  {i + 1}. {s.title}
                </span>
              </li>
            ))}
          </ol>
        </div>

        {/* 본문 */}
        {report.sections.map((s, i) => (
          <section
            key={s.id}
            className={`py-8 print-section ${i > 0 ? "border-t" : ""}`}
          >
            <h2 className="text-lg font-bold text-gray-900 mb-4">
              {i + 1}. {s.title}
            </h2>
            <div className="prose-sm max-w-none text-[13px] leading-relaxed">
              <Markdown content={s.content} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
