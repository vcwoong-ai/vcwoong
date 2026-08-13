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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTION_META, getKoreanVisualWidth } from "@/types";
import { SectionStatus } from "@prisma/client";
import { Markdown } from "@/components/ui/markdown";
import { ReportPreviewPanel } from "@/components/reports/report-preview-panel";
import { useToast } from "@/hooks/use-toast";
import { useConfirm } from "@/hooks/use-confirm";

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
  /** 품질 패널에서 요청한 개선 재생성 */
  improveRequest?: {
    sectionKey: string;
    qualityIssues: string[];
    token: number;
  } | null;
  onImproveHandled?: () => void;
  /** 조회 전용 (팀 심사역 등) */
  readOnly?: boolean;
}

export function ReportEditor({
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
  improveRequest,
  onImproveHandled,
  readOnly = false,
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
  const handledImproveToken = useRef<number | null>(null);

  // 서버에서 섹션이 갱신되면(재생성·일괄개선 후 refresh) 로컬 상태를 다시 맞춘다
  useEffect(() => {
    setLocalSections(sections);
    setEditingSectionId(null);
  }, [sections]);

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
    setEditingSectionId(section.id);
    setEditContent(section.content);
  };

  const cancelEdit = () => {
    setEditingSectionId(null);
    setEditContent("");
  };

  const saveSection = async (section: Section) => {
    setSaving(section.id);
    try {
      const response = await fetch(`/api/reports/${reportId}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: section.id,
          content: editContent,
        }),
      });

      if (!response.ok) throw new Error("저장 실패");

      setLocalSections((prev) =>
        prev.map((s) =>
          s.id === section.id ? { ...s, content: editContent } : s
        )
      );
      setEditingSectionId(null);
    } catch (error) {
      console.error(error);
      toast.error("저장 실패", { description: "다시 시도해 주세요" });
    } finally {
      setSaving(null);
    }
  };

  const approveSection = async (section: Section) => {
    setSaving(section.id);
    try {
      const response = await fetch(`/api/reports/${reportId}/sections`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sectionId: section.id,
          status: SectionStatus.APPROVED,
        }),
      });

      if (!response.ok) throw new Error("승인 실패");

      setLocalSections((prev) =>
        prev.map((s) =>
          s.id === section.id ? { ...s, status: SectionStatus.APPROVED } : s
        )
      );
    } catch (error) {
      console.error(error);
      toast.error("섹션 승인 실패", { description: "다시 시도해 주세요" });
    } finally {
      setSaving(null);
    }
  };

  const regenerateSection = async (
    section: Section,
    opts?: { qualityIssues?: string[]; skipConfirm?: boolean }
  ) => {
    if (!opts?.skipConfirm) {
      const ok = await confirm({
        title: `"${section.title}" 섹션을 다시 생성할까요?`,
        description: "이 섹션의 기존 내용은 덮어씌워집니다.",
        confirmLabel: "재생성",
        destructive: true,
      });
      if (!ok) return;
    }
    setRegeneratingKey(section.sectionKey);
    try {
      const response = await fetch(
        `/api/reports/${reportId}/sections/regenerate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sectionKey: section.sectionKey,
            qualityIssues: opts?.qualityIssues?.slice(0, 12),
          }),
        }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error ?? "재생성 실패");
      }
      const { data } = await response.json();
      if (data?.section) {
        setLocalSections((prev) =>
          prev.map((s) =>
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
    } catch (error) {
      console.error(error);
      toast.error("섹션 재생성 실패", {
        description:
          error instanceof Error ? error.message : "다시 시도해 주세요",
      });
    } finally {
      setRegeneratingKey(null);
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
    setApprovingAll(true);
    try {
      const response = await fetch(`/api/reports/${reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approveAllSections: true }),
      });
      if (!response.ok) throw new Error("전체 승인 실패");
      setLocalSections((prev) =>
        prev.map((s) => ({ ...s, status: SectionStatus.APPROVED }))
      );
    } catch (error) {
      console.error(error);
      toast.error("전체 승인 실패", { description: "다시 시도해 주세요" });
    } finally {
      setApprovingAll(false);
    }
  };

  const approvedCount = localSections.filter(
    (s) => s.status === SectionStatus.APPROVED
  ).length;
  const totalCount = localSections.length;
  const allApproved = totalCount > 0 && approvedCount === totalCount;
  const isFinal = reportStatus === "FINAL" || reportStatus === "EXPORTED";

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
            className="bg-blue-600 hover:bg-blue-700"
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
              className={cn(
                "transition-all",
                isApproved && "border-green-200 bg-green-50/30"
              )}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-mono text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                      {meta?.order}
                    </span>
                    <CardTitle className="text-base">{section.title}</CardTitle>
                    {isApproved && (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
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
