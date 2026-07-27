"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Download, FileText, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type CompareStatus = "filled" | "unmapped" | "missing-content";

interface CompareRow {
  heading: string;
  sectionKey: string | null;
  originalPreview: string;
  generatedPreview: string | null;
  status: CompareStatus;
}

interface CompareData {
  template: { id: string; name: string; fileType: string; originalName: string };
  report: { id: string; title: string; companyName: string } | null;
  rows: CompareRow[];
  appendedSections: Array<{ sectionKey: string; title: string }>;
  coverage: number;
}

const STATUS_META: Record<CompareStatus, { label: string; tone: string }> = {
  filled: { label: "채워짐", tone: "bg-green-50 text-green-700 border-green-200" },
  unmapped: { label: "원본 유지", tone: "bg-gray-100 text-gray-500 border-gray-200" },
  "missing-content": {
    label: "본문 없음",
    tone: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

export function TemplateCompareClient({
  template,
  reports,
  initialReportId,
}: {
  template: { id: string; name: string; fileType: string };
  reports: Array<{ id: string; label: string }>;
  initialReportId: string | null;
}) {
  const [reportId, setReportId] = useState(initialReportId ?? reports[0]?.id ?? "");
  const [data, setData] = useState<CompareData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const query = reportId ? `?reportId=${encodeURIComponent(reportId)}` : "";
      const res = await fetch(`/api/templates/${template.id}/compare${query}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "비교 데이터를 불러오지 못했습니다");
      setData(json.data);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : "불러오기 실패");
    } finally {
      setLoading(false);
    }
  }, [template.id, reportId]);

  useEffect(() => {
    load();
  }, [load]);

  const exportExact = async () => {
    if (!reportId) return;
    setExporting(true);
    try {
      const res = await fetch(`/api/reports/${reportId}/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "exact" }),
      });
      if (!res.ok) throw new Error("내보내기 실패");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${data?.report?.companyName ?? "보고서"}_${template.name}.${
        template.fileType === "PPTX" ? "pptx" : "docx"
      }`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "내보내기 실패");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link
            href="/templates"
            className="text-sm text-gray-500 hover:text-gray-800 inline-flex items-center gap-1"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            양식 관리
          </Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">{template.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            원본 양식의 각 항목에 어떤 내용이 채워지는지 비교합니다. 원본 파일을 열어
            본문만 교체하므로 폰트·색상·여백은 그대로 유지됩니다.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {reports.length > 0 && (
            <Select value={reportId} onValueChange={setReportId}>
              <SelectTrigger className="w-72">
                <SelectValue placeholder="비교할 보고서 선택" />
              </SelectTrigger>
              <SelectContent>
                {reports.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button
            onClick={exportExact}
            disabled={!reportId || exporting || !data}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            원본 양식으로 내보내기
          </Button>
        </div>
      </div>

      {loading && (
        <Card>
          <CardContent className="py-16 text-center text-sm text-gray-400">
            <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
            원본 양식을 분석하는 중...
          </CardContent>
        </Card>
      )}

      {error && !loading && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "원본 항목", value: `${data.rows.length}개` },
              {
                label: "채워짐",
                value: `${data.rows.filter((r) => r.status === "filled").length}개`,
              },
              { label: "재현 커버리지", value: `${data.coverage}%` },
              { label: "끝에 덧붙임", value: `${data.appendedSections.length}개` },
            ].map((c) => (
              <Card key={c.label}>
                <CardContent className="pt-4 pb-4">
                  <p className="text-xs text-gray-400">{c.label}</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{c.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {!data.report && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              비교할 보고서를 선택하면 각 항목에 들어갈 실제 본문을 볼 수 있습니다.
            </div>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="w-4 h-4" />
                항목별 비교
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.rows.map((row, i) => {
                const meta = STATUS_META[row.status];
                return (
                  <div key={i} className="border rounded-lg overflow-hidden">
                    <div className="flex items-center gap-2 flex-wrap bg-gray-50 px-3 py-2 border-b">
                      <span className="font-medium text-sm text-gray-900">
                        {row.heading}
                      </span>
                      {row.sectionKey && (
                        <Badge variant="outline" className="text-[10px]">
                          {row.sectionKey}
                        </Badge>
                      )}
                      <span
                        className={cn(
                          "text-[11px] px-2 py-0.5 rounded border font-medium ml-auto",
                          meta.tone
                        )}
                      >
                        {meta.label}
                      </span>
                    </div>
                    <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x">
                      <div className="p-3">
                        <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
                          원본
                        </p>
                        <p className="text-xs text-gray-500 whitespace-pre-wrap">
                          {row.originalPreview || "(내용 없음)"}
                        </p>
                      </div>
                      <div className="p-3">
                        <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
                          생성 결과
                        </p>
                        <p
                          className={cn(
                            "text-xs whitespace-pre-wrap",
                            row.generatedPreview ? "text-gray-700" : "text-gray-400"
                          )}
                        >
                          {row.generatedPreview ??
                            (row.status === "unmapped"
                              ? "원본 내용을 그대로 둡니다"
                              : "이 섹션의 생성 본문이 없습니다")}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          {data.appendedSections.length > 0 && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  원본에 자리가 없어 문서 끝에 덧붙는 섹션
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {data.appendedSections.map((s) => (
                  <Badge key={s.sectionKey} variant="outline">
                    {s.title}
                  </Badge>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
