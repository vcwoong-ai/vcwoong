"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Upload,
  FileText,
  Loader2,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

interface Template {
  id: string;
  name: string;
  description: string | null;
  fileType: "DOCX" | "PPTX";
  originalName: string;
  fileSize: number;
  status: "PENDING" | "ANALYZING" | "READY" | "ERROR";
  structure: Record<string, unknown> | null;
  sectionMap: Record<string, unknown> | null;
  createdAt: string;
}

const STATUS_CONFIG = {
  PENDING:   { label: "대기 중",  icon: Clock,         color: "bg-gray-100 text-gray-600" },
  ANALYZING: { label: "분석 중",  icon: Loader2,       color: "bg-amber-100 text-amber-700" },
  READY:     { label: "사용 가능", icon: CheckCircle2, color: "bg-green-100 text-green-700" },
  ERROR:     { label: "오류",     icon: AlertCircle,  color: "bg-red-100 text-red-700" },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface TemplateCardProps {
  template: Template;
  onDelete: (id: string) => void;
}

function TemplateCard({ template, onDelete }: TemplateCardProps) {
  const [expanded, setExpanded] = useState(false);
  const statusCfg = STATUS_CONFIG[template.status];
  const StatusIcon = statusCfg.icon;

  const sections = (template.structure as { sections?: Array<{ title: string; level: number }> })?.sections ?? [];
  const mappings = (template.sectionMap as { mappings?: Array<{ templateSection: string; sectionKey: string | null; confidence: number }> })?.mappings ?? [];
  const coverageRate = (template.sectionMap as { coverageRate?: number })?.coverageRate ?? 0;

  return (
    <Card className="hover:shadow-sm transition-shadow">
      <CardContent className="py-4 px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-blue-500" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold text-gray-900">{template.name}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${statusCfg.color}`}>
                  <StatusIcon className={`w-3 h-3 ${template.status === "ANALYZING" ? "animate-spin" : ""}`} />
                  {statusCfg.label}
                </span>
                <Badge variant="outline" className="text-xs">{template.fileType}</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {template.originalName} · {formatFileSize(template.fileSize)}
                {template.status === "READY" && (
                  <span className="ml-2 text-green-600">
                    섹션 {sections.length}개 · 커버리지 {Math.round(coverageRate * 100)}%
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            {template.status === "READY" && sections.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-gray-500"
              >
                {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                상세
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(template.id)}
              className="text-red-400 hover:text-red-600 hover:bg-red-50"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* 섹션 매핑 상세 */}
        {expanded && mappings.length > 0 && (
          <div className="mt-4 border rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
              섹션 매핑 결과 ({mappings.filter(m => m.sectionKey).length}/{mappings.length}개 매핑됨)
            </div>
            <div className="divide-y">
              {mappings.map((m, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span className="text-gray-700 truncate flex-1">{m.templateSection}</span>
                  <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                    {m.sectionKey ? (
                      <>
                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{m.sectionKey}</span>
                        <span className="text-xs text-gray-400">{Math.round(m.confidence * 100)}%</span>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400">매핑 없음</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TemplatesClient({ templates: initialTemplates }: { templates: Template[] }) {
  const [templates, setTemplates] = useState(initialTemplates);
  const [uploading, setUploading] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [dragFile, setDragFile] = useState<File | null>(null);
  const [error, setError] = useState("");

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles[0]) {
      setDragFile(acceptedFiles[0]);
      if (!templateName) {
        setTemplateName(acceptedFiles[0].name.replace(/\.[^.]+$/, ""));
      }
    }
  }, [templateName]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
    },
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!dragFile) return;
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", dragFile);
      formData.append("name", templateName || dragFile.name);

      const res = await fetch("/api/templates", { method: "POST", body: formData });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "업로드 실패");
      }

      const { data } = await res.json();
      setTemplates([data, ...templates]);
      setDragFile(null);
      setTemplateName("");

      // 분석 완료될 때까지 폴링
      pollUntilReady(data.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "업로드 오류");
    } finally {
      setUploading(false);
    }
  };

  const pollUntilReady = async (id: string) => {
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const res = await fetch(`/api/templates/${id}`);
      if (!res.ok) break;
      const { data } = await res.json();
      setTemplates((prev) => prev.map((t) => (t.id === id ? data : t)));
      if (data.status === "READY" || data.status === "ERROR") break;
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 양식을 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/templates/${id}`, { method: "DELETE" });
    if (res.ok) {
      setTemplates(templates.filter((t) => t.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">양식 관리</h1>
        <p className="text-gray-500 mt-1">
          사용 중인 투자심의보고서 양식을 업로드하면 AI가 구조를 분석해 동일한 형식으로 보고서를 생성합니다.
        </p>
      </div>

      {/* 안내 배너 */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <Sparkles className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
        <div className="text-sm text-blue-800">
          <p className="font-medium">양식 재현 엔진 사용법</p>
          <ol className="mt-1 space-y-1 text-blue-700 list-decimal list-inside">
            <li>기존 IC 보고서 DOCX 또는 PPTX를 업로드</li>
            <li>AI가 섹션 구조를 자동 분석 및 매핑 (30초~1분)</li>
            <li>딜 상세 페이지에서 보고서 생성 시 이 양식 선택</li>
            <li>AI 생성 내용이 업로드한 양식 구조 그대로 출력</li>
          </ol>
        </div>
      </div>

      {/* 업로드 영역 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">양식 업로드</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 양식 이름 */}
          <div className="space-y-1.5">
            <Label htmlFor="template-name">양식 이름</Label>
            <Input
              id="template-name"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="예: 우리 VC 투자심의보고서 양식"
            />
          </div>

          {/* 드래그앤드롭 */}
          <div
            {...getRootProps()}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
              isDragActive ? "border-blue-400 bg-blue-50" : "border-gray-200 hover:border-gray-300"
            }`}
          >
            <input {...getInputProps()} />
            <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
            {dragFile ? (
              <div>
                <p className="font-medium text-gray-700">{dragFile.name}</p>
                <p className="text-sm text-gray-500">{formatFileSize(dragFile.size)}</p>
              </div>
            ) : (
              <div>
                <p className="text-gray-600">
                  {isDragActive ? "여기에 놓으세요" : "DOCX 또는 PPTX를 드래그하거나 클릭하여 업로드"}
                </p>
                <p className="text-xs text-gray-400 mt-1">기존에 사용하던 투자심의보고서 양식 파일</p>
              </div>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </p>
          )}

          <Button
            onClick={handleUpload}
            disabled={!dragFile || uploading}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {uploading ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />분석 중...</>
            ) : (
              <><Upload className="w-4 h-4 mr-2" />양식 업로드 및 분석</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* 양식 목록 */}
      <div>
        <h2 className="text-base font-semibold text-gray-900 mb-3">
          등록된 양식 ({templates.length}개)
        </h2>
        {templates.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <FileText className="w-8 h-8 mx-auto mb-2 opacity-40" />
            <p>등록된 양식이 없습니다</p>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((t) => (
              <TemplateCard key={t.id} template={t} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
