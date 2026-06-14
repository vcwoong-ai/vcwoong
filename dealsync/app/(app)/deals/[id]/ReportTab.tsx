"use client";

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Sparkles,
  Download,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  FileText,
  Edit3,
  Save,
} from "lucide-react";
import { toast } from "sonner";
import { REPORT_SECTIONS } from "@/lib/report-sections";
import { countChars } from "@/lib/charCount";

interface SectionData {
  title: string;
  content: string;
  keyPoints: string[];
}

interface Report {
  id: string;
  sections: Record<string, SectionData> | null;
  status: string;
  generatedAt: string;
  version: number;
}

interface Props {
  dealId: string;
  reports: Report[];
}

type GenerationStatus = "idle" | "generating" | "complete" | "error";

interface SectionProgress {
  [key: string]: "pending" | "generating" | "complete" | "error";
}

export default function ReportTab({ dealId, reports: initialReports }: Props) {
  const [, setReports] = useState<Report[]>(initialReports);
  const [activeReport, setActiveReport] = useState<Report | null>(
    initialReports[0] || null
  );
  const [generationStatus, setGenerationStatus] = useState<GenerationStatus>("idle");
  const [sectionProgress, setSectionProgress] = useState<SectionProgress>({});
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["overview"]));
  const [editingSections, setEditingSections] = useState<Set<string>>(new Set());
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});
  const [regeneratingSection, setRegeneratingSection] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const generateReport = async (regenerateSection?: string) => {
    if (!regenerateSection) {
      setGenerationStatus("generating");
      setSectionProgress({});
      setProgress(0);
      setStatusMessage("보고서 생성을 시작합니다...");
    } else {
      setRegeneratingSection(regenerateSection);
    }

    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/generate-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, regenerateSection }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json();
        toast.error(err.error || "보고서 생성에 실패했습니다.");
        setGenerationStatus("error");
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              handleSSEEvent(data);
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        toast.error("연결 오류가 발생했습니다.");
        setGenerationStatus("error");
      }
    } finally {
      setRegeneratingSection(null);
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleSSEEvent = (data: any) => {
    switch (data.type) {
      case "start":
        setStatusMessage(data.message);
        break;
      case "section_start":
        setSectionProgress((prev) => ({
          ...prev,
          [data.sectionKey]: "generating",
        }));
        setStatusMessage(`${data.sectionTitle} 섹션 생성 중... (${data.index}/${data.total})`);
        break;
      case "section_complete":
        setSectionProgress((prev) => ({
          ...prev,
          [data.sectionKey]: "complete",
        }));
        setProgress(Math.round((data.index / data.total) * 100));

        setActiveReport((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            sections: {
              ...(prev.sections || {}),
              [data.sectionKey]: data.data,
            },
          };
        });
        break;
      case "section_error":
        setSectionProgress((prev) => ({
          ...prev,
          [data.sectionKey]: "error",
        }));
        break;
      case "complete":
        setGenerationStatus("complete");
        setProgress(100);
        setStatusMessage("보고서 생성 완료!");
        toast.success("투자심의보고서가 생성되었습니다!");

        const newReport: Report = {
          id: Date.now().toString(),
          sections: data.sections,
          status: "DRAFT",
          generatedAt: new Date().toISOString(),
          version: 1,
        };
        setActiveReport(newReport);
        setReports((prev) => [newReport, ...prev]);
        break;
      case "error":
        setGenerationStatus("error");
        toast.error(data.message);
        break;
    }
  };

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const startEditing = (key: string, currentContent: string) => {
    setEditingSections((prev) => new Set(prev).add(key));
    setEditedContent((prev) => ({ ...prev, [key]: currentContent }));
  };

  const saveEdit = async (key: string) => {
    if (!activeReport) return;
    const newContent = editedContent[key];
    setActiveReport((prev) => {
      if (!prev || !prev.sections) return prev;
      return {
        ...prev,
        sections: {
          ...prev.sections,
          [key]: { ...prev.sections[key], content: newContent },
        },
      };
    });
    setEditingSections((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
    toast.success("수정이 저장되었습니다.");
  };

  const exportToDocx = async () => {
    if (!activeReport?.sections) return;

    toast.loading("DOCX 파일 생성 중...");

    try {
      const res = await fetch(`/api/deals/${dealId}/export-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sections: activeReport.sections }),
      });

      if (!res.ok) {
        toast.dismiss();
        toast.error("내보내기에 실패했습니다.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `투자심의보고서_${new Date().toLocaleDateString("ko-KR").replace(/\./g, "")}.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.dismiss();
      toast.success("DOCX 파일이 다운로드되었습니다.");
    } catch {
      toast.dismiss();
      toast.error("파일 생성 중 오류가 발생했습니다.");
    }
  };

  const isGenerating = generationStatus === "generating";
  const hasSections = activeReport?.sections && Object.keys(activeReport.sections).length > 0;

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Generation Control */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 mb-0.5">AI 투자심의보고서 자동 생성</h3>
              <p className="text-sm text-muted-foreground">
                업로드된 문서를 분석하여 10개 섹션의 보고서를 자동으로 작성합니다
              </p>
              {isGenerating && (
                <div className="mt-3 space-y-1.5">
                  <Progress value={progress} className="h-1.5" />
                  <p className="text-xs text-[#1B4FD8] font-medium">{statusMessage}</p>
                </div>
              )}
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {hasSections && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={exportToDocx}
                  className="gap-1.5"
                  disabled={isGenerating}
                >
                  <Download className="w-4 h-4" />
                  DOCX 내보내기
                </Button>
              )}
              <Button
                onClick={() => generateReport()}
                disabled={isGenerating}
                className="bg-[#1B4FD8] hover:bg-[#1540B0] gap-1.5"
                size="sm"
              >
                {isGenerating ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {isGenerating ? "생성 중..." : hasSections ? "재생성" : "보고서 생성"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Empty state */}
      {!hasSections && !isGenerating && (
        <div className="text-center py-16">
          <FileText className="w-14 h-14 text-gray-200 mx-auto mb-4" />
          <h3 className="font-semibold text-gray-700 mb-1">보고서가 없습니다</h3>
          <p className="text-sm text-muted-foreground mb-4">
            문서를 업로드하고 AI 보고서 생성 버튼을 클릭하세요
          </p>
        </div>
      )}

      {/* Section Cards */}
      {(hasSections || isGenerating) && (
        <div className="space-y-3">
          {REPORT_SECTIONS.map((section, idx) => {
            const sectionData = activeReport?.sections?.[section.key];
            const status = sectionProgress[section.key];
            const isExpanded = expandedSections.has(section.key);
            const isEditing = editingSections.has(section.key);
            const isRegenerating = regeneratingSection === section.key;

            const content = isEditing
              ? editedContent[section.key]
              : sectionData?.content || "";

            const charCount = countChars(content);
            const charPct = Math.min(100, Math.round((charCount / section.charLimit) * 100));

            return (
              <Card
                key={section.key}
                className={`border shadow-sm transition-all ${
                  status === "generating" || isRegenerating
                    ? "border-[#1B4FD8]/50 bg-blue-50/30"
                    : status === "complete" || sectionData
                    ? "border-border"
                    : "border-border opacity-60"
                }`}
              >
                <div
                  className="flex items-center justify-between p-4 cursor-pointer"
                  onClick={() => sectionData && toggleSection(section.key)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500">
                      {idx + 1}
                    </div>
                    <div>
                      <h4 className="font-semibold text-sm text-gray-900">
                        {section.title}
                      </h4>
                      {sectionData && (
                        <div className="flex items-center gap-2 mt-0.5">
                          <div className="flex items-center gap-1">
                            <div className="w-16 h-1 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  charPct > 90 ? "bg-amber-400" : "bg-[#1B4FD8]"
                                }`}
                                style={{ width: `${charPct}%` }}
                              />
                            </div>
                            <span className={`text-[10px] font-medium ${
                              charPct > 90 ? "text-amber-600" : "text-muted-foreground"
                            }`}>
                              {charCount}/{section.charLimit}자
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {status === "generating" || isRegenerating ? (
                      <Loader2 className="w-4 h-4 text-[#1B4FD8] animate-spin" />
                    ) : status === "error" ? (
                      <AlertCircle className="w-4 h-4 text-red-500" />
                    ) : sectionData ? (
                      <CheckCircle className="w-4 h-4 text-green-500" />
                    ) : null}

                    {sectionData && !isGenerating && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          generateReport(section.key);
                        }}
                        className="h-7 gap-1 text-xs text-muted-foreground hover:text-[#1B4FD8]"
                        disabled={!!regeneratingSection}
                      >
                        <RefreshCw className="w-3 h-3" />
                        재생성
                      </Button>
                    )}

                    {sectionData && (
                      isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-gray-400" />
                      )
                    )}
                  </div>
                </div>

                {sectionData && isExpanded && (
                  <div className="px-4 pb-4 space-y-3">
                    <div className="h-px bg-border" />

                    {/* Key Points */}
                    {sectionData.keyPoints && sectionData.keyPoints.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {sectionData.keyPoints.map((point: string, i: number) => (
                          <span
                            key={i}
                            className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-xs font-medium"
                          >
                            {point}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Content */}
                    {isEditing ? (
                      <div className="space-y-2">
                        <Textarea
                          value={editedContent[section.key] || ""}
                          onChange={(e) =>
                            setEditedContent((prev) => ({
                              ...prev,
                              [section.key]: e.target.value,
                            }))
                          }
                          className="min-h-[180px] text-sm leading-relaxed resize-none"
                        />
                        <div className="flex items-center justify-between">
                          <span className={`text-xs ${
                            countChars(editedContent[section.key] || "") > section.charLimit
                              ? "text-red-500"
                              : "text-muted-foreground"
                          }`}>
                            {countChars(editedContent[section.key] || "")}/{section.charLimit}자
                          </span>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() =>
                                setEditingSections((prev) => {
                                  const next = new Set(prev);
                                  next.delete(section.key);
                                  return next;
                                })
                              }
                              className="h-7 text-xs"
                            >
                              취소
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => saveEdit(section.key)}
                              className="h-7 text-xs bg-[#1B4FD8] hover:bg-[#1540B0] gap-1"
                            >
                              <Save className="w-3 h-3" />
                              저장
                            </Button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="relative group">
                        <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                          {content}
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => startEditing(section.key, content)}
                          className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity h-7 gap-1 text-xs text-muted-foreground hover:text-[#1B4FD8]"
                        >
                          <Edit3 className="w-3 h-3" />
                          편집
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
