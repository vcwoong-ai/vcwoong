"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CheckCircle,
  Edit3,
  Save,
  Download,
  Loader2,
  CheckCheck,
  BadgeCheck,
  Copy,
  BarChart2,
  Printer,
  RefreshCw,
  GitCompare,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTION_META, getKoreanVisualWidth } from "@/types";
import { SectionStatus } from "@prisma/client";
import { Markdown } from "@/components/ui/markdown";
import { ReportPreviewPanel } from "@/components/reports/report-preview-panel";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";
import { isReportFinalized } from "@/lib/report-completion";
import { reportReviewVersion } from "@/lib/report-review-version";

interface Section {
  id: string;
  sectionKey: string;
  title: string;
  content: string;
  order: number;
  status: SectionStatus;
  feedback?: string | null;
}

interface ReportEditorProps {
  onBusyChange?: (busy: boolean) => void;
  reportId: string;
  sections: Section[];
  dealName: string;
  onExport?: () => void;
  onExportPptx?: () => void;
  isExporting?: boolean;
  reportStatus?: string;
  onFinalize?: () => void;
  isFinalizing?: boolean;
  onRegenerate?: () => void;
  isRegenerating?: boolean;
  /** 섹션 단위 재생성 성공 시 (품질 패널 새로고침용) */
  onSectionRegenerated?: (sectionKey: string, qualityScore?: number) => void;
  onSectionSaved?: () => void;
  onSectionsChanged?: (sections: Section[]) => void;
  /** 품질 패널에서 요청한 개선 재생성 */
  improveRequest?: {
    sectionKey: string;
    qualityIssues: string[];
    token: number;
  } | null;
  onImproveHandled?: () => void;
  /** 조회 전용 (팀 심사역 등) */
  readOnly?: boolean;
  /** NVIDIA NIM 설정 여부 — false면 "다른 모델로 비교" 버튼 자체를 숨긴다 */
  nimConfigured?: boolean;
}

interface CompareModelResult {
  model: string;
  ok: boolean;
  content?: string;
  tokensUsed?: number;
  error?: string;
}

export function ReportEditor({
  onBusyChange,
  reportId,
  sections,
  dealName,
  onExport,
  onExportPptx,
  isExporting,
  reportStatus,
  onFinalize,
  isFinalizing,
  onRegenerate,
  isRegenerating,
  onSectionRegenerated,
  onSectionSaved,
  onSectionsChanged,
  improveRequest,
  onImproveHandled,
  readOnly = false,
  nimConfigured = false,
}: ReportEditorProps) {
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [localSections, setLocalSections] = useState<Section[]>(sections);
  const [copied, setCopied] = useState(false);
  const [regeneratingKey, setRegeneratingKey] = useState<string | null>(null);
  const [lastRegenQuality, setLastRegenQuality] = useState<{
    sectionKey: string;
    score: number;
  } | null>(null);
  const [comparingKey, setComparingKey] = useState<string | null>(null);
  const [openCompareKey, setOpenCompareKey] = useState<string | null>(null);
  const [compareResults, setCompareResults] = useState<
    Record<string, CompareModelResult[]>
  >({});
  const [compareError, setCompareError] = useState<
    Record<string, string | undefined>
  >({});
  const handledImproveToken = useRef<number | null>(null);

  const sectionsRef = useRef(sections);
  const resourceRef = useRef({ reportId, readOnly });
  resourceRef.current = { reportId, readOnly };
  const editBaseRef = useRef<Section | null>(null);
  const mutationPendingRef = useRef(false);
  const mutationEpochRef = useRef(0);
  const mutationControllerRef = useRef<AbortController | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  useEffect(() => {
    onBusyChange?.(!!editingSectionId || !!saving || approvingAll || !!regeneratingKey || !!comparingKey);
  }, [onBusyChange, editingSectionId, saving, approvingAll, regeneratingKey, comparingKey]);

  useEffect(() => {
    editBaseRef.current = null;
    setEditingSectionId(null);
    setEditContent("");
    setEditError(null);
    return () => {
      // This ref is a request epoch, not a DOM node; cleanup intentionally invalidates its current value.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      mutationEpochRef.current++;
      mutationControllerRef.current?.abort();
      mutationPendingRef.current = false;
    };
  }, [reportId]);

  useEffect(() => {
    mutationEpochRef.current++;
    mutationControllerRef.current?.abort();
    mutationPendingRef.current = false;
    setSaving(null);
    setApprovingAll(false);
    setRegeneratingKey(null);
    sectionsRef.current = sections;
    setLocalSections(sections);
    // Preserve a user's edit and its original base even when newer server props arrive.
  }, [sections, readOnly]);

  const commitSections = (next: Section[]) => {
    sectionsRef.current = next;
    setLocalSections(next);
    onSectionsChanged?.(next);
  };
  const beginMutation = () => {
    if (readOnly || resourceRef.current.readOnly || resourceRef.current.reportId !== reportId || mutationPendingRef.current) return null;
    mutationPendingRef.current = true;
    const epoch = mutationEpochRef.current;
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    return {
      signal: controller.signal,
      current: () => !controller.signal.aborted && epoch === mutationEpochRef.current && resourceRef.current.reportId === reportId && !resourceRef.current.readOnly,
      finish: () => {
        if (!controller.signal.aborted && epoch === mutationEpochRef.current) {
          mutationPendingRef.current = false;
          mutationControllerRef.current = null;
        }
      },
    };
  };

  const sortedSections = [...localSections].sort((a, b) => a.order - b.order);

  const totalChars = sortedSections.reduce((s, sec) => s + getKoreanVisualWidth(sec.content), 0);

  const copyAll = async () => {
    const text = sortedSections
      .map((s) => `## ${s.title}\n\n${s.content}`)
      .join("\n\n---\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("클립보드 복사 실패", {
        description: "브라우저 권한을 확인해 주세요",
      });
    }
  };

  const startEdit = (section: Section) => {
    if (readOnly || mutationPendingRef.current) return;
    editBaseRef.current = { ...section };
    setEditError(null);
    setEditingSectionId(section.id);
    setEditContent(section.content);
  };

  const cancelEdit = () => {
    if (mutationPendingRef.current) return;
    editBaseRef.current = null;
    setEditError(null);
    setEditingSectionId(null);
    setEditContent("");
  };

  const saveSection = async (section: Section) => {
    const base = editBaseRef.current;
    if (!base || base.id !== section.id) return;
    const mutation = beginMutation();
    if (!mutation) return;
    const content = editContent;
    setSaving(section.id);
    setEditError(null);
    try {
      const expectedReviewVersion = await reportReviewVersion([base]);
      if (!mutation.current()) return;
      const response = await fetch(`/api/reports/${reportId}/sections`, {
        method: "PATCH", signal: mutation.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: base.id, content, expectedReviewVersion }),
      });
      if (!mutation.current()) return;
      if (!response.ok) {
        setEditError(response.status === 409
          ? "다른 변경이 먼저 저장되었습니다. 작성 중인 내용은 유지했습니다. 최신 본문을 확인한 뒤 다시 편집해 주세요."
          : response.status === 401 || response.status === 403
            ? "저장 권한을 확인하지 못했습니다. 작성 중인 내용을 보관한 뒤 로그인과 권한을 확인해 주세요."
            : "저장 결과를 확인하지 못했습니다. 작성 중인 내용을 보관하고 최신 본문을 조회해 확인해 주세요.");
        return;
      }
      const result = await response.json();
      if (!mutation.current()) return;
      if (!result.data || result.data.id !== base.id || typeof result.data.content !== "string" ||
          !["DRAFT", "REVIEWED", "APPROVED"].includes(result.data.status)) throw new Error("Invalid save response");
      commitSections(sectionsRef.current.map(s => s.id === base.id ? { ...s, ...result.data } : s));
      editBaseRef.current = null;
      setEditingSectionId(null);
      onSectionSaved?.();
    } catch {
      if (mutation.current()) setEditError("저장 결과를 확인하지 못했습니다. 작성 중인 내용을 보관하고 최신 본문을 조회해 확인해 주세요.");
    } finally {
      if (mutation.current()) setSaving(null);
      mutation.finish();
    }
  };

  const approveSection = async (section: Section) => {
    const mutation = beginMutation();
    if (!mutation) return;
    setSaving(section.id);
    try {
      const expectedReviewVersion = await reportReviewVersion([section]);
      if (!mutation.current()) return;
      const response = await fetch(`/api/reports/${reportId}/sections`, {
        method: "PATCH", signal: mutation.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionId: section.id, status: SectionStatus.APPROVED, expectedReviewVersion }),
      });
      if (!mutation.current()) return;
      if (!response.ok) throw new Error("Approval unavailable");
      const result = await response.json();
      if (!mutation.current()) return;
      if (!result.data || result.data.id !== section.id || result.data.status !== "APPROVED") throw new Error("Invalid approval response");
      commitSections(sectionsRef.current.map(s => s.id === section.id ? { ...s, ...result.data } : s));
    } catch {
      if (mutation.current()) toast.error("섹션 승인 결과를 확인하지 못했습니다", { description: "최신 본문과 승인 상태를 다시 확인해 주세요." });
    } finally {
      if (mutation.current()) setSaving(null);
      mutation.finish();
    }
  };

  const regenerateSection = async (
    section: Section,
    opts?: { qualityIssues?: string[]; skipConfirm?: boolean }
  ) => {
    if (readOnly || mutationPendingRef.current) return;
    const confirmedEpoch = mutationEpochRef.current;
    if (!opts?.skipConfirm) {
      const ok = await confirm({
        title: `"${section.title}" 섹션을 다시 생성할까요?`,
        description: "이 섹션의 기존 내용은 덮어씌워집니다.",
        confirmLabel: "재생성",
        destructive: true,
      });
      if (!ok) return;
    }
    if (confirmedEpoch !== mutationEpochRef.current || resourceRef.current.reportId !== reportId || resourceRef.current.readOnly) return;
    const mutation = beginMutation();
    if (!mutation) return;
    setRegeneratingKey(section.sectionKey);
    try {
      const response = await fetch(
        `/api/reports/${reportId}/sections/regenerate`,
        {
          method: "POST",
          signal: mutation.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sectionKey: section.sectionKey,
            qualityIssues: opts?.qualityIssues?.slice(0, 12),
          }),
        }
      );
      if (!mutation.current()) return;
      if (!response.ok) throw new Error("Regeneration unavailable");
      const { data } = await response.json();
      if (!mutation.current()) return;
      if (!data?.section || data.section.sectionKey !== section.sectionKey || typeof data.section.content !== "string") throw new Error("Invalid regeneration response");
      if (data.section) {
        commitSections(
          sectionsRef.current.map((s) =>
            s.sectionKey === section.sectionKey
              ? {
                  ...s,
                  content: data.section.content,
                  status: SectionStatus.DRAFT,
                }
              : s
          )
        );
        const score = data?.quality?.score as number | undefined;
        if (typeof score === "number") {
          setLastRegenQuality({
            sectionKey: section.sectionKey,
            score,
          });
        }
        onSectionRegenerated?.(section.sectionKey, score);
      }
    } catch {
      if (mutation.current()) toast.error("섹션 재생성 결과를 확인하지 못했습니다", { description: "최신 본문을 다시 확인해 주세요." });
    } finally {
      if (mutation.current()) setRegeneratingKey(null);
      mutation.finish();
    }
  };

  /**
   * "다른 모델로 비교" — 지금 섹션과 완전히 같은 프롬프트를 NIM의 다른
   * 모델 여러 개로 병렬 호출해서 나란히 보여준다. 읽기 전용이라 결과가
   * 나와도 섹션 내용은 그대로다(교체 기능 없음).
   */
  const compareSection = async (section: Section) => {
    if (openCompareKey === section.sectionKey) {
      setOpenCompareKey(null);
      return;
    }
    setOpenCompareKey(section.sectionKey);
    if (compareResults[section.sectionKey] || comparingKey) return;

    setComparingKey(section.sectionKey);
    setCompareError((prev) => ({ ...prev, [section.sectionKey]: undefined }));
    try {
      const response = await fetch(`/api/reports/${reportId}/sections/compare`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sectionKey: section.sectionKey }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error ?? "모델 비교 실패");
      }
      const { data } = await response.json();
      setCompareResults((prev) => ({
        ...prev,
        [section.sectionKey]: data.results ?? [],
      }));
    } catch (error) {
      setCompareError((prev) => ({
        ...prev,
        [section.sectionKey]:
          error instanceof Error ? error.message : "다시 시도해 주세요",
      }));
    } finally {
      setComparingKey(null);
    }
  };

  useEffect(() => {
    if (!improveRequest) return;
    // Strict Mode에서 이펙트가 두 번 실행돼 중복 요청이 나가는 것을 막는다
    if (handledImproveToken.current === improveRequest.token) return;
    handledImproveToken.current = improveRequest.token;

    const section = localSections.find(
      (s) => s.sectionKey === improveRequest.sectionKey
    );
    if (!section) {
      onImproveHandled?.();
      return;
    }
    void regenerateSection(section, {
      qualityIssues: improveRequest.qualityIssues,
      skipConfirm: true,
    }).finally(() => onImproveHandled?.());
    // token으로 동일 섹션 재요청도 처리
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [improveRequest?.token]);

  const approveAll = async () => {
    const mutation = beginMutation();
    if (!mutation) return;
    const snapshot = sectionsRef.current;
    setApprovingAll(true);
    try {
      const expectedReviewVersion = await reportReviewVersion(snapshot);
      if (!mutation.current()) return;
      const response = await fetch(`/api/reports/${reportId}`, {
        method: "PATCH", signal: mutation.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approveAllSections: true, expectedReviewVersion }),
      });
      if (!mutation.current()) return;
      if (!response.ok) throw new Error("Approval unavailable");
      const result = await response.json();
      if (!mutation.current()) return;
      if (!Array.isArray(result.data?.sections) || result.data.sections.length !== snapshot.length ||
          !result.data.sections.every((s: Section) => s && snapshot.some(original => original.id === s.id) && s.status === "APPROVED" && typeof s.content === "string")) throw new Error("Invalid approval response");
      commitSections(result.data.sections);
    } catch {
      if (mutation.current()) toast.error("전체 승인 결과를 확인하지 못했습니다", { description: "최신 본문과 승인 상태를 다시 확인해 주세요." });
    } finally {
      if (mutation.current()) setApprovingAll(false);
      mutation.finish();
    }
  };

  const approvedCount = localSections.filter(
    (s) => s.status === SectionStatus.APPROVED
  ).length;
  const totalCount = localSections.length;
  const allApproved = totalCount > 0 && approvedCount === totalCount;
  const isFinal = isReportFinalized(reportStatus, localSections);

  return (
    <div className="space-y-4">
      {/* Header — 내보내기 버튼이 많아 좁은 화면에서는 세로로 쌓고 줄바꿈한다 */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 break-words">{dealName}</h2>
          <p className="text-sm text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>승인: {approvedCount}/{totalCount} 섹션</span>
            <span className="flex items-center gap-1">
              <BarChart2 className="w-3 h-3" />
              {totalChars.toLocaleString()}자
            </span>
            {isFinal && (
              <span className="inline-flex items-center gap-1 text-green-600 font-medium">
                <BadgeCheck className="w-3.5 h-3.5" />
                완성본
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={copyAll}>
            {copied ? <CheckCircle className="w-4 h-4 mr-1.5 text-green-500" /> : <Copy className="w-4 h-4 mr-1.5" />}
            {copied ? "복사됨" : "전체 복사"}
          </Button>
          <a href={`/reports/${reportId}/print`} target="_blank" rel="noreferrer">
            <Button variant="outline" size="sm">
              <Printer className="w-4 h-4 mr-1.5" />
              PDF
            </Button>
          </a>
          {!isFinal && onRegenerate && (
            <Button
              variant="outline"
              onClick={onRegenerate}
              disabled={isRegenerating}
            >
              {isRegenerating ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              재생성
            </Button>
          )}
          {!isFinal && !allApproved && !readOnly && (
            <Button
              variant="outline"
              onClick={approveAll}
              disabled={approvingAll}
              className="border-green-300 text-green-700 hover:bg-green-50"
            >
              {approvingAll ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCheck className="w-4 h-4 mr-2" />
              )}
              전체 승인
            </Button>
          )}
          {!isFinal && onFinalize && (
            <Button
              onClick={onFinalize}
              disabled={isFinalizing}
              className="bg-green-600 hover:bg-green-700"
            >
              {isFinalizing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <BadgeCheck className="w-4 h-4 mr-2" />
              )}
              보고서 완성
            </Button>
          )}
          <Button
            onClick={onExport}
            disabled={isExporting}
            className="bg-primary hover:bg-primary/90"
          >
            {isExporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            DOCX
          </Button>
          {onExportPptx && (
            <Button
              variant="outline"
              onClick={onExportPptx}
              disabled={isExporting}
            >
              PPTX
            </Button>
          )}
        </div>
      </div>

      {lastRegenQuality && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800">
          재생성 완료 · {lastRegenQuality.sectionKey} 품질{" "}
          <strong>{lastRegenQuality.score}/100</strong>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-3 space-y-4">
        {sortedSections.map((section) => {
          const meta = SECTION_META.find((m) => m.key === section.sectionKey);
          const isEditing = editingSectionId === section.id;
          const isSaving = saving === section.id;
          const isApproved = section.status === SectionStatus.APPROVED;
          const charWidth = getKoreanVisualWidth(section.content);

          return (
            <Card
              key={section.id}
              // PR-K: Investment Decision 패널의 "관련 상세 섹션" 참조가
              // 실제로 이 섹션 위치로 스크롤할 수 있게 하는 고정 앵커.
              // 새 URL/ID를 지어내지 않고 이미 있는 sectionKey를 그대로 쓴다.
              id={`section-${section.sectionKey}`}
              className={cn(
                "scroll-mt-4 transition-all",
                isApproved && "border-green-200 bg-green-50/30"
              )}
            >
              <CardHeader className="pb-3">
                {/* 좁은 화면에서는 제목 줄과 버튼 줄이 세로로 쌓인다(버튼 4개가 한 줄에 못 들어가 페이지가 가로로 넘치던 문제) */}
                <div className="flex flex-wrap items-center justify-between gap-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                      {meta?.order}
                    </span>
                    <CardTitle className="text-base">{section.title}</CardTitle>
                    {isApproved && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-gray-400">
                      {charWidth.toLocaleString()}자
                    </span>
                    {!isEditing && !readOnly && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => regenerateSection(section)}
                          disabled={regeneratingKey !== null}
                          title="이 섹션만 AI 재생성"
                        >
                          {regeneratingKey === section.sectionKey ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3 mr-1" />
                          )}
                          재생성
                        </Button>
                        {nimConfigured && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => compareSection(section)}
                            disabled={comparingKey !== null && comparingKey !== section.sectionKey}
                            title="같은 프롬프트를 다른 모델로도 호출해 비교(읽기 전용)"
                          >
                            {comparingKey === section.sectionKey ? (
                              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                            ) : (
                              <GitCompare className="w-3 h-3 mr-1" />
                            )}
                            다른 모델로 비교
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEdit(section)}
                        >
                          <Edit3 className="w-3 h-3 mr-1" />
                          편집
                        </Button>
                        {!isApproved && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="border-green-300 text-green-700 hover:bg-green-50"
                            onClick={() => approveSection(section)}
                            disabled={isSaving || regeneratingKey !== null}
                          >
                            <CheckCircle className="w-3 h-3 mr-1" />
                            승인
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <div className="space-y-3">
                    {editError && <p role="alert" data-testid="report-edit-error" className="text-sm text-red-600">{editError}</p>}
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="min-h-[300px] font-mono text-sm resize-y"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-gray-500">
                        {getKoreanVisualWidth(editContent).toLocaleString()}자
                        {meta && (
                          <span className="ml-2 text-gray-400">
                            (권장: {meta.minChars}~{meta.maxChars}자)
                          </span>
                        )}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={cancelEdit}
                        >
                          취소
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => saveSection(section)}
                          disabled={isSaving}
                        >
                          {isSaving ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Save className="w-3 h-3 mr-1" />
                          )}
                          저장
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    {section.content ? (
                      <Markdown content={section.content} />
                    ) : (
                      <span className="text-gray-400 italic text-sm">내용이 없습니다</span>
                    )}
                  </div>
                )}
              </CardContent>
              {openCompareKey === section.sectionKey && (
                <CardContent className="pt-0 border-t">
                  <div className="flex items-center justify-between mb-3 mt-3">
                    <p className="text-xs font-medium text-gray-500">
                      다른 모델 비교 결과 (읽기 전용 — 클릭해도 섹션 내용은 바뀌지 않습니다)
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setOpenCompareKey(null)}
                    >
                      <X className="w-3 h-3 mr-1" />
                      닫기
                    </Button>
                  </div>
                  {comparingKey === section.sectionKey ? (
                    <div className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      여러 모델을 동시에 호출하는 중 — 최대 45초 정도 걸릴 수 있습니다
                    </div>
                  ) : compareError[section.sectionKey] ? (
                    <p className="text-sm text-red-600 py-2">
                      {compareError[section.sectionKey]}
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {(compareResults[section.sectionKey] ?? []).map((r) => (
                        <div
                          key={r.model}
                          className="rounded-lg border border-gray-200 p-3"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-mono font-medium text-gray-700">
                              {r.model}
                            </span>
                            {r.ok && (
                              <span className="text-xs text-gray-400">
                                {getKoreanVisualWidth(r.content ?? "").toLocaleString()}자
                              </span>
                            )}
                          </div>
                          {r.ok ? (
                            <Markdown content={r.content ?? ""} />
                          ) : (
                            <p className="text-xs text-red-600">
                              실패: {r.error}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              )}
            </Card>
          );
        })}
        </div>

        <div className="xl:col-span-2 hidden xl:block">
          <ReportPreviewPanel sections={sortedSections} />
        </div>
      </div>
    </div>
  );
}
