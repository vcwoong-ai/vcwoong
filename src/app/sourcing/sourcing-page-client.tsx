"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowUpRight,
  Inbox,
  Loader2,
  Mail,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { cn } from "@/lib/utils";
import {
  INBOUND_STATUS_LABEL,
  INBOUND_STATUS_TONE,
  SOURCE_LABEL,
  scoreTone,
} from "@/lib/sourcing";
import type { DealSourceType, InboundStatus } from "@prisma/client";

interface Lead {
  id: string;
  companyName: string;
  sector: string;
  source: DealSourceType;
  contactName: string | null;
  contactEmail: string | null;
  summary: string | null;
  screeningScore: number | null;
  screeningNotes: string | null;
  status: InboundStatus;
  dealId: string | null;
  createdAt: string;
  userId?: string;
  teamId?: string | null;
}

const SOURCES: DealSourceType[] = [
  "INBOUND",
  "REFERRAL",
  "DEMO_DAY",
  "ACCELERATOR",
  "OUTREACH",
  "PARTNER",
  "OTHER",
];

const STATUS_FILTERS: Array<InboundStatus | "ALL"> = [
  "ALL",
  "NEW",
  "REVIEWING",
  "QUALIFIED",
  "PROMOTED",
  "REJECTED",
];

export function SourcingPageClient({
  leads,
  currentUserId,
  canEditShared = true,
  role = "ANALYST",
}: {
  leads: Lead[];
  currentUserId?: string;
  canEditShared?: boolean;
  role?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const [showForm, setShowForm] = useState(leads.length === 0);
  const [formMode, setFormMode] = useState<"manual" | "email">("manual");
  const [filter, setFilter] = useState<InboundStatus | "ALL">("ALL");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [polling, setPolling] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [source, setSource] = useState<DealSourceType>("INBOUND");
  const [contactEmail, setContactEmail] = useState("");
  const [summary, setSummary] = useState("");
  const [rawEmail, setRawEmail] = useState("");

  const visible =
    filter === "ALL" ? leads : leads.filter((l) => l.status === filter);

  const counts = {
    total: leads.length,
    qualified: leads.filter((l) => l.status === "QUALIFIED").length,
    promoted: leads.filter((l) => l.status === "PROMOTED").length,
    unscored: leads.filter((l) => l.screeningScore == null).length,
  };

  const addLead = async () => {
    if (!companyName.trim()) {
      toast.error("기업명을 입력하세요");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sourcing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          source,
          contactEmail: contactEmail.trim(),
          summary: summary.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "등록 실패");
      }
      setCompanyName("");
      setContactEmail("");
      setSummary("");
      setShowForm(false);
      toast.success("인바운드 딜을 등록했습니다");
      router.refresh();
    } catch (e) {
      toast.error("등록 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setSaving(false);
    }
  };

  const importEmail = async () => {
    if (rawEmail.trim().length < 20) {
      toast.error("이메일 원문을 붙여넣으세요");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/sourcing/import-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawEmail: rawEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "파싱 실패");
      setRawEmail("");
      setShowForm(false);
      toast.success(
        `${json.parsed?.companyName ?? json.data?.companyName} 등록 완료`,
        {
          description: json.parsed?.contactEmail
            ? `연락처: ${json.parsed.contactEmail}`
            : undefined,
        }
      );
      router.refresh();
    } catch (e) {
      toast.error("메일 파싱 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setSaving(false);
    }
  };

  const screen = async (id: string) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/sourcing/${id}/screen`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "스크리닝 실패");
      }
      router.refresh();
    } catch (e) {
      toast.error("스크리닝 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setBusyId(null);
    }
  };

  const promote = async (id: string) => {
    const ok = await confirm({
      title: "심사 파이프라인으로 전환할까요?",
      description: "인바운드 딜이 정식 딜로 등록되고 딜 상세로 이동합니다.",
      confirmLabel: "전환",
    });
    if (!ok) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/sourcing/${id}/promote`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "전환 실패");
      }
      const { data } = await res.json();
      router.push(`/deals/${data.deal.id}`);
    } catch (e) {
      toast.error("전환 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
      setBusyId(null);
    }
  };

  const setStatus = async (id: string, status: InboundStatus) => {
    setBusyId(id);
    try {
      await fetch(`/api/sourcing/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title: "인바운드 딜을 삭제할까요?",
      description: "되돌릴 수 없습니다.",
      confirmLabel: "삭제",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(id);
    try {
      await fetch(`/api/sourcing/${id}`, { method: "DELETE" });
      toast.success("삭제했습니다");
      router.refresh();
    } finally {
      setBusyId(null);
    }
  };

  const pollInbox = async () => {
    setPolling(true);
    try {
      const res = await fetch("/api/sourcing/poll", { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "폴링 실패");
      const imported = json.data?.imported ?? 0;
      if (imported > 0) {
        toast.success(`${imported}건의 메일을 인박스로 가져왔습니다`);
      } else {
        toast.toast("새로 가져온 메일이 없습니다", {
          description: "드롭폴더·IMAP 설정을 확인해 주세요",
        });
      }
      router.refresh();
    } catch (e) {
      toast.error("폴링 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setPolling(false);
    }
  };

  const canMutateLead = (lead: Lead) => {
    if (!currentUserId) return canEditShared;
    if (lead.userId === currentUserId) return true;
    return Boolean(lead.teamId) && canEditShared;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">딜소싱 인박스</h1>
          <p className="text-sm text-gray-500 mt-1">
            인바운드 딜을 모아 AI로 1차 선별하고 심사 파이프라인으로 넘깁니다.
            외부 연동: <code className="text-xs bg-gray-100 px-1 rounded">POST /api/sourcing/webhook</code>
          </p>
          {role === "ANALYST" && (
            <p className="text-xs text-amber-700 mt-1">
              심사역 계정 — 팀 공유 인바운드는 조회만 가능합니다.
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={pollInbox} disabled={polling}>
            {polling ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 mr-2" />
            )}
            메일함 폴링
          </Button>
          <Button
            onClick={() => setShowForm((v) => !v)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            딜 추가
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "전체", value: counts.total },
          { label: "적격", value: counts.qualified },
          { label: "딜 전환", value: counts.promoted },
          { label: "미평가", value: counts.unscored },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-400">{c.label}</p>
              <p className="text-xl font-bold text-gray-900 mt-0.5">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {showForm && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <CardTitle className="text-base">인바운드 딜 등록</CardTitle>
              <div className="flex gap-1">
                <Button
                  variant={formMode === "manual" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormMode("manual")}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  수동
                </Button>
                <Button
                  variant={formMode === "email" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setFormMode("email")}
                >
                  <Mail className="w-3.5 h-3.5 mr-1" />
                  메일 붙여넣기
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {formMode === "email" ? (
              <>
                <p className="text-xs text-gray-500">
                  .eml 파일 내용 또는 Outlook/Gmail에서 복사한 이메일 원문을
                  붙여넣으면 기업명·연락처·요약을 자동 추출합니다.
                </p>
                <Textarea
                  value={rawEmail}
                  onChange={(e) => setRawEmail(e.target.value)}
                  rows={12}
                  placeholder={"From: founder@startup.com\nSubject: [스타트업] Series A IR\n\n..."}
                />
                <Button
                  onClick={importEmail}
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  메일에서 딜 등록
                </Button>
              </>
            ) : (
              <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <Label htmlFor="src-name">기업명</Label>
                <Input
                  id="src-name"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="예: 그린루프"
                />
              </div>
              <div>
                <Label>유입 경로</Label>
                <Select
                  value={source}
                  onValueChange={(v) => setSource(v as DealSourceType)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {SOURCE_LABEL[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="src-email">담당자 이메일 (선택)</Label>
                <Input
                  id="src-email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="founder@startup.kr"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="src-summary">사업 요약 / 제출 자료</Label>
              <Textarea
                id="src-summary"
                rows={5}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="IR 메일 본문이나 사업 요약을 붙여넣으세요. 섹터는 자동 추정됩니다."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>
                취소
              </Button>
              <Button
                onClick={addLead}
                disabled={saving}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                등록
              </Button>
            </div>
              </>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setFilter(s)}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border transition-colors",
              filter === s
                ? "bg-gray-900 text-white border-gray-900"
                : "bg-white text-gray-600 hover:border-gray-400"
            )}
          >
            {s === "ALL" ? "전체" : INBOUND_STATUS_LABEL[s]}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <Inbox className="w-12 h-12 mx-auto text-gray-300 mb-3" />
            <p className="text-gray-500">인바운드 딜이 없습니다.</p>
            <p className="text-sm text-gray-400 mt-1">
              IR 메일이나 데모데이에서 받은 자료를 붙여넣어 시작하세요.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((l) => (
            <Card key={l.id}>
              <CardContent className="pt-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">
                        {l.companyName}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {l.sector}
                      </Badge>
                      <span
                        className={cn(
                          "text-xs px-2 py-0.5 rounded border font-medium",
                          INBOUND_STATUS_TONE[l.status]
                        )}
                      >
                        {INBOUND_STATUS_LABEL[l.status]}
                      </span>
                      <span className="text-xs text-gray-400">
                        {SOURCE_LABEL[l.source]}
                      </span>
                      {l.teamId && (
                        <Badge variant="secondary" className="text-xs">
                          팀
                        </Badge>
                      )}
                    </div>

                    {l.summary && (
                      <p className="text-sm text-gray-600 mt-1.5 line-clamp-2">
                        {l.summary}
                      </p>
                    )}

                    {l.screeningNotes && (
                      <div className="mt-2 text-xs text-gray-600 bg-gray-50 border rounded p-2 whitespace-pre-wrap">
                        {l.screeningNotes}
                      </div>
                    )}

                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {l.status !== "PROMOTED" && canMutateLead(l) && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => screen(l.id)}
                            disabled={busyId === l.id}
                          >
                            {busyId === l.id ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <Sparkles className="w-3 h-3 mr-1" />
                            )}
                            AI 스크리닝
                          </Button>
                          <Button
                            size="sm"
                            onClick={() => promote(l.id)}
                            disabled={busyId === l.id}
                            className="bg-blue-600 hover:bg-blue-700"
                          >
                            딜로 전환
                            <ArrowUpRight className="w-3 h-3 ml-1" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setStatus(l.id, "REJECTED")}
                            disabled={busyId === l.id}
                          >
                            보류
                          </Button>
                        </>
                      )}
                      {l.status !== "PROMOTED" && !canMutateLead(l) && (
                        <span className="text-xs text-amber-700">조회 전용</span>
                      )}
                      {l.dealId && (
                        <Link href={`/deals/${l.dealId}`}>
                          <Button variant="outline" size="sm">
                            딜 보기
                            <ArrowUpRight className="w-3 h-3 ml-1" />
                          </Button>
                        </Link>
                      )}
                      {currentUserId && l.userId === currentUserId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(l.id)}
                        disabled={busyId === l.id}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                      )}
                    </div>
                  </div>

                  <div className="text-center shrink-0">
                    <p className="text-xs text-gray-400">스크리닝</p>
                    <div
                      className={cn(
                        "mt-1 w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold",
                        scoreTone(l.screeningScore)
                      )}
                    >
                      {l.screeningScore ?? "—"}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
