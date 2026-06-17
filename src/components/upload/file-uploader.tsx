"use client";

import { useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, File, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

interface UploadedFile {
  file: File;
  status: "idle" | "uploading" | "done" | "error";
  progress: number;
  error?: string;
  documentId?: string;
}

interface FileUploaderProps {
  dealId: string;
  onUploadComplete?: (documentId: string) => void;
}

const ACCEPTED_TYPES = {
  "application/pdf": [".pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
    ".xlsx",
  ],
  "application/vnd.ms-excel": [".xls"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    [".pptx"],
  "text/plain": [".txt"],
};

export function FileUploader({ dealId, onUploadComplete }: FileUploaderProps) {
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const dealIdRef = useRef(dealId);
  dealIdRef.current = dealId;

  const uploadSingleFile = useCallback(async (uploadedFile: UploadedFile) => {
    setFiles((prev) =>
      prev.map((f) =>
        f.file === uploadedFile.file
          ? { ...f, status: "uploading" as const, progress: 10 }
          : f
      )
    );

    try {
      const formData = new FormData();
      formData.append("file", uploadedFile.file);
      formData.append("dealId", dealIdRef.current);

      const progressInterval = setInterval(() => {
        setFiles((prev) =>
          prev.map((f) =>
            f.file === uploadedFile.file && f.progress < 80
              ? { ...f, progress: f.progress + 15 }
              : f
          )
        );
      }, 500);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "업로드 실패");
      }

      const result = await response.json();

      setFiles((prev) =>
        prev.map((f) =>
          f.file === uploadedFile.file
            ? {
                ...f,
                status: "done" as const,
                progress: 100,
                documentId: result.data.id,
              }
            : f
        )
      );

      onUploadComplete?.(result.data.id);
    } catch (error) {
      setFiles((prev) =>
        prev.map((f) =>
          f.file === uploadedFile.file
            ? {
                ...f,
                status: "error" as const,
                progress: 0,
                error: error instanceof Error ? error.message : "업로드 실패",
              }
            : f
        )
      );
    }
  }, [onUploadComplete]);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newFiles: UploadedFile[] = acceptedFiles.map((file) => ({
        file,
        status: "idle" as const,
        progress: 0,
      }));
      setFiles((prev) => [...prev, ...newFiles]);

      newFiles.forEach((uf) => uploadSingleFile(uf));
    },
    [uploadSingleFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 50 * 1024 * 1024,
  });

  const removeFile = (file: File) => {
    setFiles((prev) => prev.filter((f) => f.file !== file));
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
          isDragActive
            ? "border-blue-500 bg-blue-50"
            : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
        )}
      >
        <input {...getInputProps()} />
        <Upload
          className={cn(
            "w-10 h-10 mx-auto mb-3",
            isDragActive ? "text-blue-500" : "text-gray-400"
          )}
        />
        <p className="text-sm font-medium text-gray-700">
          {isDragActive
            ? "파일을 여기에 놓으세요"
            : "파일을 드래그하거나 클릭하여 업로드"}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          PDF, DOCX, XLSX, PPTX, TXT 지원 · 최대 50MB
        </p>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((uf, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 bg-white border rounded-lg"
            >
              <div className="flex-shrink-0">
                {uf.status === "done" ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : uf.status === "error" ? (
                  <AlertCircle className="w-5 h-5 text-red-500" />
                ) : uf.status === "uploading" ? (
                  <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
                ) : (
                  <File className="w-5 h-5 text-gray-400" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700 truncate">
                  {uf.file.name}
                </p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-gray-500">
                    {formatSize(uf.file.size)}
                  </span>
                  {uf.status === "done" && (
                    <span className="text-xs text-green-600">
                      업로드 완료 · 텍스트 추출됨
                    </span>
                  )}
                  {uf.status === "error" && (
                    <span className="text-xs text-red-600">{uf.error}</span>
                  )}
                  {uf.status === "uploading" && (
                    <Progress value={uf.progress} className="w-24 h-1.5" />
                  )}
                </div>
              </div>

              {uf.status !== "uploading" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => removeFile(uf.file)}
                >
                  <X className="w-3 h-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
