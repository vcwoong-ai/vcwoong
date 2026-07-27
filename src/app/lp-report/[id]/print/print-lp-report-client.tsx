"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Markdown } from "@/components/ui/markdown";
import { BRAND } from "@/lib/brand";

interface PrintLpReport {
  id: string;
  title: string;
  period: string;
  content: string;
  createdAt: string;
  fund: { name: string; vintageYear: number; fundSize: number };
}

export function PrintLpReportClient({ report }: { report: PrintLpReport }) {
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
            href="/lp-report"
            className="text-sm border px-4 py-2 rounded-lg hover:bg-gray-50"
          >
            LP 리포팅으로 돌아가기
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
            LP 분기 보고서
          </h1>
          <p className="text-xl text-gray-800 mt-4">{report.fund.name}</p>
          <p className="text-sm text-gray-500 mt-2">
            {report.fund.vintageYear} vintage · 결성{" "}
            {report.fund.fundSize.toLocaleString()}억원
          </p>
          <p className="text-xs text-gray-400 mt-8">
            {report.period} ·{" "}
            {new Date(report.createdAt).toLocaleDateString("ko-KR", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
          <p className="text-[11px] text-gray-400 mt-10">
            대외비 — 본 문서는 LP 배포를 위한 자료입니다.
          </p>
        </div>

        {/* 본문 */}
        <div className="py-8 print-section text-[13px] leading-relaxed">
          <Markdown content={report.content} />
        </div>
      </div>
    </div>
  );
}
