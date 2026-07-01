"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { X, FileText, Upload } from "lucide-react";

export type UploadedItem = {
  id: string;
  name: string;
  type: "file" | "url" | "text";
  content?: string;
  file?: File;
};

interface StepUploadProps {
  companyName: string;
  onCompanyNameChange: (name: string) => void;
  uploadedItems: UploadedItem[];
  onItemsChange: (items: UploadedItem[]) => void;
  onNext: () => void;
}

export function StepUpload({
  companyName,
  onCompanyNameChange,
  uploadedItems,
  onItemsChange,
  onNext,
}: StepUploadProps) {
  const [urlInput, setUrlInput] = useState("");
  const [textInput, setTextInput] = useState("");

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const newItems: UploadedItem[] = acceptedFiles.map((f) => ({
        id: crypto.randomUUID(),
        name: f.name,
        type: "file",
        file: f,
      }));
      onItemsChange([...uploadedItems, ...newItems]);
    },
    [uploadedItems, onItemsChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
      "application/vnd.ms-excel": [".xls"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
  });

  function addUrl() {
    if (!urlInput.trim()) return;
    onItemsChange([
      ...uploadedItems,
      { id: crypto.randomUUID(), name: urlInput, type: "url", content: urlInput },
    ]);
    setUrlInput("");
  }

  function addText() {
    if (!textInput.trim()) return;
    onItemsChange([
      ...uploadedItems,
      { id: crypto.randomUUID(), name: "직접 입력 텍스트", type: "text", content: textInput },
    ]);
    setTextInput("");
  }

  function removeItem(id: string) {
    onItemsChange(uploadedItems.filter((i) => i.id !== id));
  }

  const canProceed = uploadedItems.length > 0 && companyName.trim();

  return (
    <div className="space-y-6">
      <div>
        <Label className="text-base font-semibold">자료 업로드</Label>
        <p className="text-sm text-gray-500 mb-3">
          PDF, PPTX, Excel, DOCX 형식의 IR 자료를 업로드하세요
        </p>
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-300 hover:border-blue-400"
          }`}
        >
          <input {...getInputProps()} />
          <Upload className="mx-auto h-10 w-10 text-gray-400 mb-2" />
          <p className="text-gray-600">
            {isDragActive ? "파일을 놓으세요" : "파일을 드래그하거나 클릭하여 업로드"}
          </p>
          <p className="text-xs text-gray-400 mt-1">PDF, PPTX, Excel, DOCX 지원</p>
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="URL 입력 (IR 자료 링크)"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addUrl()}
        />
        <Button variant="outline" onClick={addUrl}>
          추가
        </Button>
      </div>

      <div className="space-y-2">
        <Textarea
          placeholder="텍스트 직접 입력 (회사 소개, 비즈니스 내용 등)"
          value={textInput}
          onChange={(e) => setTextInput(e.target.value)}
          rows={4}
        />
        <Button variant="outline" size="sm" onClick={addText} disabled={!textInput.trim()}>
          텍스트 추가
        </Button>
      </div>

      {uploadedItems.length > 0 && (
        <div className="space-y-2">
          <Label className="text-sm font-medium">업로드된 자료 ({uploadedItems.length}개)</Label>
          {uploadedItems.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-2 p-2 bg-gray-50 rounded-md"
            >
              <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
              <span className="text-sm flex-1 truncate">{item.name}</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => removeItem(item.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="company-name" className="text-base font-semibold">
          회사명
        </Label>
        <Input
          id="company-name"
          placeholder="투자 대상 회사명"
          value={companyName}
          onChange={(e) => onCompanyNameChange(e.target.value)}
        />
      </div>

      <Button
        className="w-full"
        onClick={onNext}
        disabled={!canProceed}
      >
        다음 단계
      </Button>
    </div>
  );
}
