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
}

export function ReportEditor({
  reportId,
  sections,
  dealName,
  onExport,
  isExporting,
}: ReportEditorProps) {
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState<string | null>(null);
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

  const approvedCount = localSections.filter(
    (s) => s.status === SectionStatus.APPROVED
  ).length;
  const totalCount = localSections.length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">{dealName}</h2>
          <p className="text-sm text-gray-500">
            승인 완료: {approvedCount}/{totalCount} 섹션
          </p>
        </div>
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
          DOCX 내보내기
        </Button>
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
                    {!isEditing && (
                      <>
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
                            disabled={isSaving}
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
