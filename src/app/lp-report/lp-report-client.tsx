"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/markdown";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Loader2, Plus, Sparkles, Wallet, Printer } from "lucide-react";
import { currentPeriod, recentPeriods } from "@/lib/portfolio";
import type { LpReportComputed } from "@/lib/lp-report";

interface FundView {
  id: string;
  name: string;
  vintageYear: number;
  fundSize: number;
  paidIn: number;
  companyCount: number;
  computed: LpReportComputed;
  reports: Array<{
    id: string;
    period: string;
    title: string;
    content: string;
    createdAt: string;
  }>;
}

export function LPReportClient({ funds }: { funds: FundView[] }) {
  const router = useRouter();
  const [selectedFundId, setSelectedFundId] = useState(funds[0]?.id ?? "");
  const [period, setPeriod] = useState(currentPeriod());
  const [generating, setGenerating] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [creatingFund, setCreatingFund] = useState(false);
  const [newFundName, setNewFundName] = useState("");
  const [newFundSize, setNewFundSize] = useState("");
  const [showCreate, setShowCreate] = useState(funds.length === 0);

  const fund = funds.find((f) => f.id === selectedFundId) ?? funds[0];

  const createFund = async () => {
    if (!newFundName.trim() || !Number(newFundSize)) {
      return alert("펀드명과 결성 총액을 입력하세요");
    }
    setCreatingFund(true);
    try {
      const res = await fetch("/api/funds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newFundName.trim(),
          vintageYear: new Date().getFullYear(),
          fundSize: Number(newFundSize),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "펀드 생성 실패");
      }
      setNewFundName("");
      setNewFundSize("");
      setShowCreate(false);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "펀드 생성 실패");
    } finally {
      setCreatingFund(false);
    }
  };

  const generate = async () => {
    if (!fund) return;
    setGenerating(true);
    try {
      const res = await fetch(`/api/funds/${fund.id}/lp-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "생성 실패");
      }
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "LP 리포트 생성 실패");
    } finally {
      setGenerating(false);
    }
  };

  const exportDocx = async (reportId: string, title: string) => {
    setExportingId(reportId);
    try {
      const res = await fetch(`/api/lp-report/${reportId}/export`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("내보내기 실패");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${title}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(e instanceof Error ? e.message : "내보내기 실패");
    } finally {
      setExportingId(null);
    }
  };

  if (funds.length === 0 || showCreate) {
    return (
      <div className="max-w-lg mx-auto py-10">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Wallet className="w-4 h-4" />
              펀드 등록
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              LP 리포트는 펀드에 연결된 포트폴리오사 실적으로 생성됩니다.
            </p>
            <div>
              <Label htmlFor="fund-name">펀드명</Label>
              <Input
                id="fund-name"
                value={newFundName}
                onChange={(e) => setNewFundName(e.target.value)}
                placeholder="예: Axiom 2호 벤처투자조합"
              />
            </div>
            <div>
              <Label htmlFor="fund-size">결성 총액 (억원)</Label>
              <Input
                id="fund-size"
                type="number"
                value={newFundSize}
                onChange={(e) => setNewFundSize(e.target.value)}
                placeholder="500"
              />
            </div>
            <div className="flex gap-2">
              {funds.length > 0 && (
                <Button variant="outline" onClick={() => setShowCreate(false)}>
                  취소
                </Button>
              )}
              <Button
                onClick={createFund}
                disabled={creatingFund}
                className="bg-blue-600 hover:bg-blue-700 flex-1"
              >
                {creatingFund && (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                )}
                펀드 만들기
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!fund) return null;
  const m = fund.computed.metrics;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">LP 리포팅</h1>
          <p className="text-sm text-gray-500 mt-1">
            포트폴리오 실적을 집계해 LP 분기 보고서를 생성합니다.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={fund.id} onValueChange={setSelectedFundId}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {funds.map((f) => (
                <SelectItem key={f.id} value={f.id}>
                  {f.name} ({f.vintageYear})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-28">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {recentPeriods(6).map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4 mr-1" />
            펀드
          </Button>
          <Button
            onClick={generate}
            disabled={generating || fund.companyCount === 0}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {generating ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="w-4 h-4 mr-2" />
            )}
            {period} 리포트 생성
          </Button>
        </div>
      </div>

      {fund.companyCount === 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          이 펀드에 연결된 포트폴리오사가 없습니다.{" "}
          <Link href="/portfolio" className="underline font-medium">
            포트폴리오
          </Link>
          에서 투자사를 등록하세요.
        </div>
      )}

      {/* 펀드 지표 */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {[
          { label: "결성", value: `${fund.fundSize.toLocaleString()}억` },
          { label: "투자 원금", value: `${m.totalInvested.toLocaleString()}억` },
          { label: "소진율", value: `${fund.computed.deployedPercent}%` },
          { label: "총 가치", value: `${m.totalValue.toLocaleString()}억` },
          { label: "TVPI", value: `${m.tvpi.toFixed(2)}x` },
          { label: "DPI", value: `${m.dpi.toFixed(2)}x` },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-400">{c.label}</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 섹터 배분 */}
      {fund.computed.sectorAllocation.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">섹터 배분</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {fund.computed.sectorAllocation.map((s) => (
              <div key={s.sector} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-20 shrink-0">
                  {s.sector}
                </span>
                <div className="flex-1 h-2.5 bg-gray-100 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-500 rounded"
                    style={{ width: `${Math.max(3, s.sharePercent)}%` }}
                  />
                </div>
                <span className="text-xs text-gray-600 w-40 text-right">
                  {s.count}개 · {s.invested.toLocaleString()}억 ({s.sharePercent}
                  %)
                </span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 생성된 리포트 */}
      {fund.reports.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-gray-400">
            생성된 LP 리포트가 없습니다. 상단에서 분기를 선택하고 생성하세요.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {fund.reports.map((r) => (
            <Card key={r.id}>
              <CardHeader className="pb-3 flex flex-row items-center justify-between gap-3 space-y-0">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-base">{r.title}</CardTitle>
                  <Badge variant="outline" className="text-xs">
                    {r.period}
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <a href={`/lp-report/${r.id}/print`} target="_blank" rel="noreferrer">
                    <Button variant="outline" size="sm">
                      <Printer className="w-3.5 h-3.5 mr-1.5" />
                      PDF
                    </Button>
                  </a>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => exportDocx(r.id, r.title)}
                    disabled={exportingId === r.id}
                  >
                  {exportingId === r.id ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  DOCX
                </Button>
                </div>
              </CardHeader>
              <CardContent>
                <Markdown content={r.content} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
