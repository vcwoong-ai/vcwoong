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
  fundName: string;
  vintageYear: number;
  createdAt: string;
}

export function PrintLpReportClient({ report }: { report: PrintLpReport }) {
  useEffect(() => {
    const t = setTimeout(() => window.print(), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <style>{`
        @page { size: A4; margin: 18mm 16mm; }
        @media print {
          .no-print { display: none !important; }
          .print-page { box-shadow: none !important; margin: 0 !important; padding: 0 !important; max-width: none !important; }
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
            LP 리포팅으로
          </Link>
        </div>
      </div>

      <div className="print-page max-w-[210mm] mx-auto bg-white shadow-sm my-6 p-12">
        <div className="text-center py-16 border-b mb-10">
          <p className="text-xs tracking-widest text-gray-400 uppercase">
            {BRAND.name}
          </p>
          <h1 className="text-2xl font-bold text-gray-900 mt-4">{report.title}</h1>
          <p className="text-sm text-gray-600 mt-2">
            {report.fundName} · Vintage {report.vintageYear}
          </p>
          <p className="text-xs text-gray-400 mt-4">
            {report.period} ·{" "}
            {new Date(report.createdAt).toLocaleDateString("ko-KR")}
          </p>
        </div>

        <div className="prose prose-sm max-w-none">
          <Markdown content={report.content} />
        </div>
      </div>
    </div>
  );
}
