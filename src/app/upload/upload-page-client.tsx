"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileUploader } from "@/components/upload/file-uploader";
import { Label } from "@/components/ui/label";
import { Info } from "lucide-react";

interface Deal {
  id: string;
  companyName: string;
  name: string;
}

export function UploadPageClient({ deals }: { deals: Deal[] }) {
  const [selectedDealId, setSelectedDealId] = useState<string>("");

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">문서 업로드</h1>
        <p className="text-gray-500 mt-1">
          IR 덱, 재무제표, 특허 문서 등을 업로드하면 AI가 자동으로 분석합니다.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">딜 선택</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label>연결할 딜</Label>
            <Select onValueChange={setSelectedDealId}>
              <SelectTrigger>
                <SelectValue placeholder="딜을 선택하세요" />
              </SelectTrigger>
              <SelectContent>
                {deals.map((deal) => (
                  <SelectItem key={deal.id} value={deal.id}>
                    <span className="font-medium">{deal.companyName}</span>
                    <span className="text-gray-500 ml-2 text-xs">
                      {deal.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {deals.length === 0 && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              <Info className="w-4 h-4 flex-shrink-0" />
              먼저 딜을 등록해주세요.
            </div>
          )}
        </CardContent>
      </Card>

      {selectedDealId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">파일 업로드</CardTitle>
          </CardHeader>
          <CardContent>
            <FileUploader
              dealId={selectedDealId}
              onUploadComplete={() => {}}
            />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-4">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-gray-600 space-y-1">
              <p className="font-medium">지원 형식</p>
              <ul className="text-gray-500 space-y-0.5 text-xs">
                <li>• <strong>PDF</strong>: IR 덱, 사업계획서, 연구 보고서</li>
                <li>• <strong>DOCX</strong>: 사업계획서, 계약서, 기술 문서</li>
                <li>• <strong>XLSX/XLS</strong>: 재무제표, 시장 데이터</li>
                <li>• <strong>PPTX</strong>: IR 발표 자료</li>
                <li>• <strong>TXT</strong>: 텍스트 문서</li>
              </ul>
              <p className="text-xs text-gray-400 mt-2">최대 파일 크기: 50MB</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
