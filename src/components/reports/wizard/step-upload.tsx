"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { X, FileText, Link } from "lucide-react";

export interface UploadedItem {
  id: string;
  name: string;
  type: "file" | "url" | "text";
  parsedText?: string;
}

interface StepUploadProps {
  companyName: string;
  onCompanyNameChange: (v: string) => void;
  items: UploadedItem[];
  onItemsChange: (items: UploadedItem[]) => void;
  onNext: () => void;
}

export function StepUpload({
  companyName,
  onCompanyNameChange,
  items,
  onItemsChange,
  onNext,
}: StepUploadProps) {
  const [urlInput, setUrlInput] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const onDrop = useCallback(
    async (files: File[]) => {
      setIsUploading(true);
      const newItems: UploadedItem[] = [];
      for (const file of files) {
        const id = `file-${Date.now()}-${Math.random()}`;
        newItems.push({ id, name: file.name, type: "file" });
      }
      onItemsChange([...items, ...newItems]);
      setIsUploading(false);
    },
    [items, onItemsChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
    },
  });

  const addUrl = () => {
    if (!urlInput.trim()) return;
    onItemsChange([
      ...items,
      { id: `url-${Date.now()}`, name: urlInput, type: "url" },
    ]);
    setUrlInput("");
  };

  const removeItem = (id: string) => {
    onItemsChange(items.filter((i) => i.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
          isDragActive ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"
        }`}
      >
        <input {...getInputProps()} />
        {isUploading ? (
          <p className="text-gray-500">업로드 중...</p>
        ) : (
          <div className="space-y-2">
            <div className="text-4xl">📁</div>
            <p className="font-medium">IR 자료를 드래그하거나 클릭하여 업로드</p>
            <p className="text-sm text-gray-400">PDF, PPTX, Excel, DOCX 지원 · 다중 업로드 가능</p>
          </div>
        )}
      </div>

      {/* URL 입력 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Link className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            placeholder="회사 홈페이지 또는 뉴스 URL 입력"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="pl-9"
            onKeyDown={(e) => e.key === "Enter" && addUrl()}
          />
        </div>
        <Button variant="outline" onClick={addUrl}>추가</Button>
      </div>

      {/* 업로드된 항목 */}
      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <FileText className="w-4 h-4 text-blue-500 shrink-0" />
              <span className="text-sm flex-1 truncate">{item.name}</span>
              <button
                onClick={() => removeItem(item.id)}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* 회사명 */}
      <div className="space-y-1.5">
        <Label>회사명</Label>
        <Input
          placeholder="투자 대상 회사명"
          value={companyName}
          onChange={(e) => onCompanyNameChange(e.target.value)}
        />
      </div>

      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={items.length === 0 || !companyName.trim()}
        >
          다음 단계
        </Button>
      </div>
    </div>
  );
}
