"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileText, Trash2, CheckCircle, AlertCircle, Loader2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Document {
  id: string;
  originalName: string;
  fileType: string;
  fileSize: number;
  filePath: string;
  extractedText: string | null;
  uploadedAt: string;
}

interface DocumentUploadProps {
  dealId: string;
  initialDocuments?: Document[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function FileTypeIcon({ type }: { type: string }) {
  const colors: Record<string, string> = {
    pdf: "text-red-500 bg-red-50",
    docx: "text-blue-500 bg-blue-50",
    txt: "text-gray-500 bg-gray-50",
  };
  const labels: Record<string, string> = { pdf: "PDF", docx: "DOCX", txt: "TXT" };
  const cls = colors[type] ?? "text-gray-500 bg-gray-50";

  return (
    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${cls}`}>
      <span className="text-[10px] font-bold">{labels[type] ?? type.toUpperCase()}</span>
    </div>
  );
}

export function DocumentUpload({ dealId, initialDocuments = [] }: DocumentUploadProps) {
  const [documents, setDocuments] = useState<Document[]>(initialDocuments);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const res = await fetch(`/api/deals/${dealId}/documents`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "업로드 실패");
        }

        const doc: Document = await res.json();
        setDocuments((prev) => [doc, ...prev]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "업로드 중 오류가 발생했습니다");
      } finally {
        setUploading(false);
        // Reset file input so the same file can be re-uploaded after removal
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [dealId]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  };

  const handleDelete = async (docId: string) => {
    try {
      const res = await fetch(`/api/deals/${dealId}/documents/${docId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("삭제 실패");
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
      if (expandedId === docId) setExpandedId(null);
    } catch {
      setError("문서 삭제 중 오류가 발생했습니다");
    }
  };

  const toggleExpand = (docId: string) => {
    setExpandedId((prev) => (prev === docId ? null : docId));
  };

  return (
    <Card className="border-gray-100">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="w-4 h-4 text-blue-600" />
          IR 자료 업로드
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Drop zone */}
        <div
          className={`relative border-2 border-dashed rounded-xl transition-colors cursor-pointer ${
            dragOver
              ? "border-blue-400 bg-blue-50"
              : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
          } ${uploading ? "pointer-events-none opacity-60" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => !uploading && fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="hidden"
            onChange={handleFileChange}
          />
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            {uploading ? (
              <>
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin mb-3" />
                <p className="text-sm font-medium text-blue-700">업로드 및 텍스트 추출 중...</p>
                <p className="text-xs text-gray-400 mt-1">잠시만 기다려주세요</p>
              </>
            ) : (
              <>
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6 text-blue-500" />
                </div>
                <p className="text-sm font-medium text-gray-700">
                  파일을 드래그하거나 클릭하여 업로드
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  PDF, DOCX, TXT · 최대 20MB
                </p>
              </>
            )}
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
            <span className="text-xs text-red-700">{error}</span>
          </div>
        )}

        {/* Document list */}
        {documents.length > 0 && (
          <ul className="space-y-2">
            {documents.map((doc) => (
              <li
                key={doc.id}
                className="rounded-xl border border-gray-100 overflow-hidden"
              >
                <div className="flex items-center gap-3 p-3">
                  <FileTypeIcon type={doc.fileType} />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {doc.originalName}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">
                        {formatBytes(doc.fileSize)}
                      </span>
                      {doc.extractedText ? (
                        <span className="flex items-center gap-1 text-xs text-green-600">
                          <CheckCircle className="w-3 h-3" />
                          텍스트 추출 완료
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-yellow-600">
                          <AlertCircle className="w-3 h-3" />
                          추출 불가
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {doc.extractedText && (
                      <button
                        type="button"
                        onClick={() => toggleExpand(doc.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                        title="추출된 텍스트 보기"
                      >
                        {expandedId === doc.id ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(doc.id)}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Extracted text preview */}
                {expandedId === doc.id && doc.extractedText && (
                  <div className="border-t border-gray-100 bg-gray-50 p-3">
                    <p className="text-xs font-medium text-gray-500 mb-2">추출된 텍스트 미리보기</p>
                    <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono leading-relaxed max-h-60 overflow-y-auto">
                      {doc.extractedText.slice(0, 3000)}
                      {doc.extractedText.length > 3000 && (
                        <span className="text-gray-400">
                          {`\n\n… (총 ${doc.extractedText.length.toLocaleString()}자 중 3,000자 표시)`}
                        </span>
                      )}
                    </pre>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {documents.length === 0 && !uploading && (
          <p className="text-xs text-gray-400 text-center py-2">
            아직 업로드된 자료가 없습니다. IR 덱, 사업계획서 등을 업로드하면 AI 보고서 생성에 활용됩니다.
          </p>
        )}

        {documents.length > 0 && (
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg">
            <CheckCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-700">
              업로드된 자료의 내용이 AI 투자심사보고서 생성 시 자동으로 반영됩니다.
            </p>
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full gap-2"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="w-3.5 h-3.5" />
          파일 선택
        </Button>
      </CardContent>
    </Card>
  );
}
