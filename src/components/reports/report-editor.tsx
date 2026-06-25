"use client";

import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SECTION_META, getKoreanVisualWidth } from "@/types";
import { SectionStatus } from "@prisma/client";

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
  isExporting?: boolean;
  reportStatus?: string;
  onFinalize?: () => void;
  isFinalizing?: boolean;
}

export function ReportEditor({
  reportId,
  sections,
  dealName,
  onExport,
  isExporting,
  reportStatus,
  onFinalize,
  isFinalizing,
}: ReportEditorProps) {
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [localSections, setLocalSections] = useState<Section[]>(sections);

  const sortedSections = [...localSections].sort((a, b) => a.order - b.order);

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
      alert("저장 중 오류가 발생했습니다");
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
    } finally {
      setSaving(null);
    }
  };

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
      alert("전체 승인 중 오류가 발생했습니다");
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
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900">{dealName}</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {approvedCount}/{totalCount} 섹션 승인
            {isFinal && (
              <span className="ml-2 inline-flex items-center gap-1 text-emerald-600 font-medium">
                <BadgeCheck className="w-3 h-3" /> 완성본
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!isFinal && !allApproved && (
            <Button variant="outline" size="sm" onClick={approveAll} disabled={approvingAll}
              className="border-emerald-200 text-emerald-700 hover:bg-emerald-50">
              {approvingAll ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <CheckCheck className="w-3.5 h-3.5 mr-1.5" />}
              전체 승인
            </Button>
          )}
          {!isFinal && onFinalize && (
            <Button size="sm" onClick={onFinalize} disabled={isFinalizing} className="bg-emerald-600 hover:bg-emerald-700">
              {isFinalizing ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <BadgeCheck className="w-3.5 h-3.5 mr-1.5" />}
              완성
            </Button>
          )}
          <Button size="sm" onClick={onExport} disabled={isExporting} className="bg-blue-600 hover:bg-blue-700">
            {isExporting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1.5" />}
            DOCX 내보내기
          </Button>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-4">
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
                isApproved && "border-emerald-100 bg-emerald-50/20"
              )}
            >
              <CardHeader className="pb-2 pt-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-gray-300 bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                      {String(meta?.order ?? section.order).padStart(2, "0")}
                    </span>
                    <CardTitle className="text-sm font-semibold">{section.title}</CardTitle>
                    {isApproved && <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-300">{charWidth.toLocaleString()}자</span>
                    {!isEditing && (
                      <>
                        <Button variant="ghost" size="sm" onClick={() => startEdit(section)}
                          className="h-7 px-2 text-xs text-gray-500">
                          <Edit3 className="w-3 h-3 mr-1" /> 편집
                        </Button>
                        {!isApproved && (
                          <Button variant="outline" size="sm"
                            className="h-7 px-2 text-xs border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            onClick={() => approveSection(section)} disabled={isSaving}>
                            <CheckCircle className="w-3 h-3 mr-1" /> 승인
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
                  <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {section.content || (
                      <span className="text-gray-400 italic">
                        내용이 없습니다
                      </span>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
