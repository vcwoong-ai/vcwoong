"use client";

import { useState, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Trash2,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  CloudUpload,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

const DOC_TYPES = [
  { value: "IR", label: "IR 자료" },
  { value: "BM", label: "사업계획서" },
  { value: "FINANCIAL", label: "재무제표" },
  { value: "OTHER", label: "기타" },
];

const typeColors: Record<string, string> = {
  IR: "bg-blue-100 text-blue-700",
  BM: "bg-purple-100 text-purple-700",
  FINANCIAL: "bg-green-100 text-green-700",
  OTHER: "bg-gray-100 text-gray-600",
};

interface Document {
  id: string;
  fileName: string;
  type: string;
  fileSize: number | null;
  extractedText: string | null;
  createdAt: string;
  mimeType: string | null;
}

interface Props {
  dealId: string;
  initialDocuments: Document[];
}

export default function DocumentsTab({ dealId, initialDocuments }: Props) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [dragOver, setDragOver] = useState(false);
  const [selectedType, setSelectedType] = useState<string>("OTHER");
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = async (file: File) => {
    setUploading(true);
    setUploadProgress(10);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("type", selectedType);

    try {
      setUploadProgress(30);
      const res = await fetch(`/api/deals/${dealId}/documents`, {
        method: "POST",
        body: formData,
      });

      setUploadProgress(80);

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "업로드에 실패했습니다.");
        return;
      }

      const doc = await res.json();
      setDocuments((prev) => [doc, ...prev]);
      setUploadProgress(100);
      toast.success(`'${file.name}' 업로드 완료`);

      if (!doc.extractedText || doc.extractedText.startsWith("[")) {
        toast.warning("텍스트 추출이 제한적입니다. PDF 또는 DOCX 파일을 권장합니다.");
      }
    } catch {
      toast.error("업로드 중 오류가 발생했습니다.");
    } finally {
      setTimeout(() => {
        setUploading(false);
        setUploadProgress(0);
      }, 500);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      uploadFile(files[0]);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
    e.target.value = "";
  };

  const deleteDocument = async (docId: string, fileName: string) => {
    if (!confirm(`'${fileName}' 문서를 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/deals/${dealId}/documents/${docId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== docId));
        toast.success("문서가 삭제되었습니다.");
      }
    } catch {
      toast.error("삭제에 실패했습니다.");
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  const getFileIcon = (mimeType: string | null, fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "pdf" || mimeType === "application/pdf") return "📄";
    if (ext === "docx" || ext === "doc") return "📝";
    if (ext === "xlsx") return "📊";
    if (ext === "pptx") return "📑";
    return "📎";
  };

  const wordCount = (text: string) => {
    const korean = (text.match(/[가-힣]/g) || []).length;
    const english = (text.match(/[a-zA-Z0-9]/g) || []).length;
    return korean + Math.round(english * 0.5);
  };

  return (
    <div className="space-y-4 max-w-4xl">
      {/* Upload Area */}
      <Card className="border-0 shadow-sm">
        <CardContent className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="space-y-1.5 flex-1">
              <label className="text-sm font-medium text-gray-700">문서 유형 선택</label>
              <Select value={selectedType} onValueChange={(v: string | null) => setSelectedType(v ?? "OTHER")}>
                <SelectTrigger className="h-9 w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DOC_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => !uploading && fileInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
              ${dragOver
                ? "border-[#1B4FD8] bg-blue-50"
                : "border-gray-200 hover:border-[#1B4FD8]/50 hover:bg-gray-50"
              }
              ${uploading ? "pointer-events-none opacity-70" : ""}
            `}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.xlsx,.pptx,.doc,.txt"
              onChange={handleFileInput}
              className="hidden"
            />
            <CloudUpload className={`w-10 h-10 mx-auto mb-3 ${dragOver ? "text-[#1B4FD8]" : "text-gray-400"}`} />
            <p className="font-medium text-gray-700">
              {dragOver ? "여기에 놓으세요!" : "클릭하거나 파일을 드래그하세요"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              PDF, DOCX, XLSX, PPTX 지원 (최대 50MB)
            </p>

            {uploading && (
              <div className="mt-4 space-y-2">
                <Progress value={uploadProgress} className="h-1.5" />
                <p className="text-sm text-[#1B4FD8] font-medium">
                  {uploadProgress < 50 ? "업로드 중..." : "텍스트 추출 중..."}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Documents List */}
      {documents.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-gray-700">
            업로드된 문서 ({documents.length}개)
          </h3>
          {documents.map((doc) => (
            <Card key={doc.id} className="border border-border shadow-none">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="text-2xl flex-shrink-0">
                    {getFileIcon(doc.mimeType, doc.fileName)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-gray-900 truncate">
                        {doc.fileName}
                      </span>
                      <Badge className={`${typeColors[doc.type]} border-0 text-[10px]`}>
                        {DOC_TYPES.find((t) => t.value === doc.type)?.label || doc.type}
                      </Badge>
                      {doc.extractedText && !doc.extractedText.startsWith("[") ? (
                        <span className="flex items-center gap-1 text-[10px] text-green-600 font-medium">
                          <CheckCircle className="w-3 h-3" />
                          텍스트 추출 완료
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-[10px] text-amber-600 font-medium">
                          <AlertCircle className="w-3 h-3" />
                          추출 제한
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                      {doc.fileSize && <span>{formatFileSize(doc.fileSize)}</span>}
                      {doc.extractedText && !doc.extractedText.startsWith("[") && (
                        <span>약 {wordCount(doc.extractedText).toLocaleString()}자</span>
                      )}
                      <span>
                        {formatDistanceToNow(new Date(doc.createdAt), {
                          addSuffix: true,
                          locale: ko,
                        })}
                      </span>
                    </div>

                    {/* Extracted text preview */}
                    {doc.extractedText && expandedDoc === doc.id && (
                      <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-border">
                        <p className="text-xs font-medium text-gray-600 mb-1.5">추출된 텍스트 미리보기</p>
                        <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap line-clamp-20">
                          {doc.extractedText.slice(0, 1500)}
                          {doc.extractedText.length > 1500 && "... (이하 생략)"}
                        </p>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    {doc.extractedText && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setExpandedDoc(expandedDoc === doc.id ? null : doc.id)
                        }
                        className="h-7 w-7 p-0 text-gray-400 hover:text-gray-600"
                      >
                        {expandedDoc === doc.id ? (
                          <EyeOff className="w-3.5 h-3.5" />
                        ) : (
                          <Eye className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteDocument(doc.id, doc.fileName)}
                      className="h-7 w-7 p-0 text-gray-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {documents.length === 0 && !uploading && (
        <div className="text-center py-8 text-muted-foreground text-sm">
          아직 업로드된 문서가 없습니다
        </div>
      )}
    </div>
  );
}
