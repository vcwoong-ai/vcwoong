"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Markdown } from "@/components/ui/markdown";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Plus,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TeamShareToggle } from "@/components/team/team-share-toggle";
import {
  PORTFOLIO_STATUS_LABEL,
  PORTFOLIO_STATUS_TONE,
  comparePeriod,
  currentPeriod,
  kpiChangePercent,
} from "@/lib/portfolio";
import type { MilestoneStatus, PortfolioStatus } from "@prisma/client";
import { useToast } from "@/hooks/use-toast";

interface Company {
  id: string;
  companyName: string;
  sector: string;
  status: PortfolioStatus;
  investedAt: string;
  investAmount: number;
  ownershipPercent: number;
  entryValuation: number;
  currentValuation: number | null;
  realizedAmount: number;
  notes: string | null;
  userId?: string;
  teamId?: string | null;
  fund: { id: string; name: string } | null;
  deal: { id: string; name: string } | null;
  kpis: Array<{
    id: string;
    period: string;
    metric: string;
    value: number;
    unit: string;
  }>;
  milestones: Array<{
    id: string;
    title: string;
    dueDate: string;
    status: MilestoneStatus;
    note: string | null;
  }>;
  updates: Array<{
    id: string;
    period: string;
    summary: string;
    highlights: string | null;
    concerns: string | null;
  }>;
}

const STATUS_OPTIONS: PortfolioStatus[] = [
  "ACTIVE",
  "WATCH",
  "RISK",
  "EXITED",
  "WRITTEN_OFF",
];

const MILESTONE_LABEL: Record<MilestoneStatus, string> = {
  PLANNED: "예정",
  IN_PROGRESS: "진행 중",
  DONE: "완료",
  DELAYED: "지연",
};

const COMMON_METRICS = ["ARR", "매출", "MAU", "런웨이", "고용", "현금"];

export function PortfolioDetailClient({
  company,
  canEdit = true,
  isOwner = true,
  userTeamId = null,
  canUseTeam = false,
  userRole = "ANALYST",
}: {
  company: Company;
  canEdit?: boolean;
  isOwner?: boolean;
  userTeamId?: string | null;
  canUseTeam?: boolean;
  userRole?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [valuation, setValuation] = useState(
    String(company.currentValuation ?? company.entryValuation)
  );
  const [realized, setRealized] = useState(String(company.realizedAmount));
  const [status, setStatus] = useState<PortfolioStatus>(company.status);

  const [kpiPeriod, setKpiPeriod] = useState(currentPeriod());
  const [kpiMetric, setKpiMetric] = useState("ARR");
  const [kpiValue, setKpiValue] = useState("");
  const [kpiUnit, setKpiUnit] = useState("억원");

  const [msTitle, setMsTitle] = useState("");
  const [msDue, setMsDue] = useState("");

  const holding =
    status === "EXITED" || status === "WRITTEN_OFF"
      ? 0
      : (Number(valuation || 0) * company.ownershipPercent) / 100;
  const moic = company.investAmount
    ? (holding + Number(realized || 0)) / company.investAmount
    : 0;

  const call = async (
    url: string,
    body: unknown,
    method: "POST" | "PATCH" = "POST"
  ) => {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "요청 실패");
    }
    return res.json();
  };

  const saveBasics = async () => {
    setSaving(true);
    setNotice(null);
    try {
      await call(
        `/api/portfolio/${company.id}`,
        {
          currentValuation: Number(valuation) || null,
          realizedAmount: Number(realized) || 0,
          status,
        },
        "PATCH"
      );
      setNotice("저장했습니다");
      router.refresh();
    } catch (e) {
      toast.error("저장 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setSaving(false);
    }
  };

  const addKpi = async () => {
    if (!kpiValue.trim()) {
      toast.error("값을 입력하세요");
      return;
    }
    setSaving(true);
    try {
      await call(`/api/portfolio/${company.id}/kpis`, {
        kpis: [
          {
            period: kpiPeriod,
            metric: kpiMetric,
            value: Number(kpiValue),
            unit: kpiUnit,
          },
        ],
      });
      setKpiValue("");
      router.refresh();
    } catch (e) {
      toast.error("KPI 저장 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setSaving(false);
    }
  };

  const addMilestone = async () => {
    if (!msTitle.trim() || !msDue) {
      toast.error("제목과 기한을 입력하세요");
      return;
    }
    setSaving(true);
    try {
      await call(`/api/portfolio/${company.id}/milestones`, {
        title: msTitle.trim(),
        dueDate: msDue,
      });
      setMsTitle("");
      setMsDue("");
      router.refresh();
    } catch (e) {
      toast.error("마일스톤 저장 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setSaving(false);
    }
  };

  const setMilestoneStatus = async (id: string, next: MilestoneStatus) => {
    setSaving(true);
    try {
      await call(
        `/api/portfolio/${company.id}/milestones`,
        { milestoneId: id, status: next },
        "PATCH"
      );
      router.refresh();
    } catch (e) {
      toast.error("상태 변경 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setSaving(false);
    }
  };

  const generateUpdate = async () => {
    setGenerating(true);
    setNotice(null);
    try {
      const { data } = await call(`/api/portfolio/${company.id}/updates`, {
        autoSummarize: true,
      });
      setNotice(`${data.period} 모니터링 노트를 생성했습니다`);
      router.refresh();
    } catch (e) {
      toast.error("노트 생성 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setGenerating(false);
    }
  };

  // 지표별 시계열
  const metricGroups = company.kpis.reduce<Record<string, typeof company.kpis>>(
    (acc, k) => {
      (acc[k.metric] ??= []).push(k);
      return acc;
    },
    {}
  );
  const metricEntries = Object.entries(metricGroups);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/portfolio">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="w-4 h-4 mr-1" />
            포트폴리오
          </Button>
        </Link>
        <span
          className={cn(
            "text-xs px-2 py-1 rounded border font-medium",
            PORTFOLIO_STATUS_TONE[status]
          )}
        >
          {PORTFOLIO_STATUS_LABEL[status]}
        </span>
        {company.teamId && (
          <Badge variant="secondary" className="text-xs">
            팀 공유
          </Badge>
        )}
        {!canEdit && (
          <Badge variant="outline" className="text-amber-700 border-amber-300">
            조회 전용 ({userRole === "ANALYST" ? "심사역" : userRole})
          </Badge>
        )}
        {company.deal && (
          <Link
            href={`/deals/${company.deal.id}`}
            className="text-xs text-blue-600 hover:underline"
          >
            원본 딜 보기
          </Link>
        )}
        <div className="ml-auto">
          <TeamShareToggle
            type="portfolio"
            resourceId={company.id}
            teamId={userTeamId}
            shared={Boolean(company.teamId)}
            isOwner={isOwner}
            canUseTeam={canUseTeam}
          />
        </div>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{company.companyName}</h1>
        <p className="text-sm text-gray-500 mt-1">
          {new Date(company.investedAt).toLocaleDateString("ko-KR")} 투자 ·{" "}
          {company.investAmount.toLocaleString()}억원 · 지분{" "}
          {company.ownershipPercent}%
          {company.fund ? ` · ${company.fund.name}` : ""}
        </p>
      </div>

      {notice && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "투자 원금", value: `${company.investAmount.toLocaleString()}억` },
          { label: "보유 지분가치", value: `${holding.toFixed(1)}억` },
          { label: "회수액", value: `${Number(realized || 0).toLocaleString()}억` },
          { label: "MOIC", value: `${moic.toFixed(2)}x` },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-400">{c.label}</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="kpi">
        <TabsList>
          <TabsTrigger value="kpi">KPI</TabsTrigger>
          <TabsTrigger value="milestones">
            마일스톤 ({company.milestones.length})
          </TabsTrigger>
          <TabsTrigger value="updates">
            분기 노트 ({company.updates.length})
          </TabsTrigger>
          <TabsTrigger value="valuation">평가·상태</TabsTrigger>
        </TabsList>

        {/* KPI */}
        <TabsContent value="kpi" className="space-y-4">
          {canEdit && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">분기 KPI 입력</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 items-end">
                <div>
                  <Label className="text-xs">분기</Label>
                  <Input
                    value={kpiPeriod}
                    onChange={(e) => setKpiPeriod(e.target.value)}
                    placeholder="2026Q1"
                  />
                </div>
                <div>
                  <Label className="text-xs">지표</Label>
                  <Select value={kpiMetric} onValueChange={setKpiMetric}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_METRICS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">값</Label>
                  <Input
                    type="number"
                    value={kpiValue}
                    onChange={(e) => setKpiValue(e.target.value)}
                    placeholder="45"
                  />
                </div>
                <div>
                  <Label className="text-xs">단위</Label>
                  <Input
                    value={kpiUnit}
                    onChange={(e) => setKpiUnit(e.target.value)}
                    placeholder="억원"
                  />
                </div>
                <Button onClick={addKpi} disabled={saving}>
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4 mr-1" />
                  )}
                  추가
                </Button>
              </div>
            </CardContent>
          </Card>
          )}

          {metricEntries.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-gray-400">
                등록된 KPI가 없습니다. 위에서 분기 실적을 입력하세요.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {metricEntries.map(([metric, series]) => {
                const sorted = [...series].sort((a, b) =>
                  comparePeriod(a.period, b.period)
                );
                const change = kpiChangePercent(sorted);
                const max = Math.max(...sorted.map((s) => Math.abs(s.value)), 1);
                return (
                  <Card key={metric}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>{metric}</span>
                        {change !== null && (
                          <span
                            className={cn(
                              "text-xs flex items-center gap-0.5 font-normal",
                              change >= 0 ? "text-green-600" : "text-red-500"
                            )}
                          >
                            <TrendingUp className="w-3 h-3" />
                            {change >= 0 ? "+" : ""}
                            {change}% QoQ
                          </span>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-1.5">
                      {sorted.map((s) => (
                        <div key={s.id} className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-400 w-14 shrink-0">
                            {s.period}
                          </span>
                          <div className="flex-1 h-2 bg-gray-100 rounded overflow-hidden">
                            <div
                              className="h-full bg-blue-400 rounded"
                              style={{
                                width: `${Math.max(
                                  4,
                                  (Math.abs(s.value) / max) * 100
                                )}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium w-20 text-right">
                            {s.value.toLocaleString()}
                            {s.unit}
                          </span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* 마일스톤 */}
        <TabsContent value="milestones" className="space-y-4">
          {canEdit && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">마일스톤 추가</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                <div className="md:col-span-1">
                  <Label className="text-xs">제목</Label>
                  <Input
                    value={msTitle}
                    onChange={(e) => setMsTitle(e.target.value)}
                    placeholder="예: Phase II 톱라인 발표"
                  />
                </div>
                <div>
                  <Label className="text-xs">기한</Label>
                  <Input
                    type="date"
                    value={msDue}
                    onChange={(e) => setMsDue(e.target.value)}
                  />
                </div>
                <Button onClick={addMilestone} disabled={saving}>
                  <Plus className="w-4 h-4 mr-1" />
                  추가
                </Button>
              </div>
            </CardContent>
          </Card>
          )}

          {company.milestones.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-gray-400">
                등록된 마일스톤이 없습니다.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {company.milestones.map((m) => {
                const overdue =
                  new Date(m.dueDate) < new Date() && m.status !== "DONE";
                return (
                  <Card key={m.id}>
                    <CardContent className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {m.title}
                        </p>
                        <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                          <CalendarClock className="w-3 h-3" />
                          {new Date(m.dueDate).toLocaleDateString("ko-KR")}
                          {overdue && (
                            <span className="text-red-500 ml-1">기한 초과</span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs",
                            m.status === "DONE" && "border-green-300 text-green-700",
                            m.status === "DELAYED" && "border-red-300 text-red-600"
                          )}
                        >
                          {MILESTONE_LABEL[m.status]}
                        </Badge>
                        {canEdit && m.status !== "DONE" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={saving}
                            onClick={() => setMilestoneStatus(m.id, "DONE")}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                            완료
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* 분기 노트 */}
        <TabsContent value="updates" className="space-y-4">
          <Card>
            <CardContent className="py-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-gray-900">
                  AI 분기 모니터링 노트
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  KPI 추이와 마일스톤을 바탕으로 요약·하이라이트·우려사항을 작성합니다.
                </p>
              </div>
              {canEdit && (
              <Button
                onClick={generateUpdate}
                disabled={generating}
                className="bg-blue-600 hover:bg-blue-700 shrink-0"
              >
                {generating ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4 mr-2" />
                )}
                {currentPeriod()} 노트 생성
              </Button>
              )}
            </CardContent>
          </Card>

          {company.updates.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-sm text-gray-400">
                작성된 분기 노트가 없습니다.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {company.updates.map((u) => (
                <Card key={u.id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{u.period}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Markdown content={u.summary} />
                    {u.highlights && (
                      <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                        <p className="text-xs font-semibold text-green-800 mb-1">
                          하이라이트
                        </p>
                        <Markdown content={u.highlights} />
                      </div>
                    )}
                    {u.concerns && (
                      <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                        <p className="text-xs font-semibold text-amber-800 mb-1">
                          우려사항
                        </p>
                        <Markdown content={u.concerns} />
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 평가·상태 */}
        <TabsContent value="valuation">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">평가 및 상태 업데이트</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">현재 기업가치 (억원)</Label>
                  <Input
                    type="number"
                    value={valuation}
                    onChange={(e) => setValuation(e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label className="text-xs">누적 회수액 (억원)</Label>
                  <Input
                    type="number"
                    value={realized}
                    onChange={(e) => setRealized(e.target.value)}
                    disabled={!canEdit}
                  />
                </div>
                <div>
                  <Label className="text-xs">상태</Label>
                  <Select
                    value={status}
                    onValueChange={(v) => setStatus(v as PortfolioStatus)}
                    disabled={!canEdit}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {PORTFOLIO_STATUS_LABEL[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {company.notes && (
                <div>
                  <Label className="text-xs">메모</Label>
                  <Textarea readOnly value={company.notes} rows={3} />
                </div>
              )}

              {canEdit ? (
              <Button
                onClick={saveBasics}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                저장
              </Button>
              ) : (
                <p className="text-xs text-amber-700">조회 전용 — 평가·상태는 수정할 수 없습니다.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
