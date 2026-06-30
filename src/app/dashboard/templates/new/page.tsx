"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TemplatePreview } from "@/components/templates/template-preview";
import type { TemplateAnalysis } from "@/lib/template-parser/pptx-analyzer";
import type { FieldMapping } from "@/lib/template-parser/field-mapper";

type Step = 1 | 2 | 3;

const STEP_LABELS = ["양식 업로드", "매핑 검토", "저장"];

export default function NewTemplatePage() {
  const [step, setStep] = useState<Step>(1);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<TemplateAnalysis | null>(null);
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [templateName, setTemplateName] = useState("");
  const [selectedElementId, setSelectedElementId] = useState<string | undefined>();

  const onDrop = useCallback(async (files: File[]) => {
    const file = files[0];
    if (!file) return;

    setIsAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/templates/analyze", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("분석 실패");
      const data = await res.json() as { analysis: TemplateAnalysis; mappings: FieldMapping[] };
      setAnalysis(data.analysis);
      setMappings(data.mappings);
      setStep(2);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
    },
    maxFiles: 1,
  });

  const handleSave = async () => {
    if (!templateName.trim()) {
      alert("양식 이름을 입력해주세요");
      return;
    }
    // TODO: Supabase에 저장
    alert(`"${templateName}" 양식이 저장되었습니다.`);
  };

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">양식 등록</h1>
        <p className="text-gray-500 text-sm mt-1">VC 투자심사보고서 양식을 등록하면 AI가 자동으로 매핑합니다.</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {([1, 2, 3] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s ? "bg-blue-600 text-white" : "bg-gray-200 text-gray-500"
              }`}
            >
              {s}
            </div>
            <span className={`text-sm ${step === s ? "font-medium" : "text-gray-400"}`}>
              {STEP_LABELS[i]}
            </span>
            {i < 2 && <div className="w-8 h-px bg-gray-300" />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>PPTX 양식 업로드</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                isDragActive ? "border-blue-400 bg-blue-50" : "border-gray-300 hover:border-gray-400"
              }`}
            >
              <input {...getInputProps()} />
              {isAnalyzing ? (
                <div className="space-y-2">
                  <div className="text-4xl animate-spin w-fit mx-auto">⚙️</div>
                  <p className="text-gray-500">AI가 양식을 분석 중입니다...</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-4xl">📄</div>
                  <p className="font-medium">PPTX 파일을 드래그하거나 클릭하여 업로드</p>
                  <p className="text-sm text-gray-400">.pptx 파일만 지원 (최대 50MB)</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Mapping review */}
      {step === 2 && analysis && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>자동 매핑 검토</CardTitle>
            </CardHeader>
            <CardContent>
              <TemplatePreview
                analysis={analysis}
                mappings={mappings}
                selectedId={selectedElementId}
                onSelectElement={setSelectedElementId}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>매핑 결과 ({mappings.length}개)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {mappings.map((m, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-2 rounded text-sm ${
                      selectedElementId === m.elementId ? "bg-blue-50" : ""
                    }`}
                  >
                    <span className="text-gray-400 w-16 shrink-0">슬라이드 {m.slideNum}</span>
                    <span className="text-gray-600 truncate flex-1">{m.originalText.slice(0, 40)}</span>
                    <span className="text-blue-600 font-mono text-xs w-40 shrink-0">{m.mappedSection}.{m.mappedField}</span>
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded ${
                        m.confidence >= 0.8
                          ? "bg-green-100 text-green-700"
                          : m.confidence >= 0.6
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-red-100 text-red-700"
                      }`}
                    >
                      {(m.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-between">
            <Button variant="outline" onClick={() => setStep(1)}>이전</Button>
            <Button onClick={() => setStep(3)}>다음 단계</Button>
          </div>
        </div>
      )}

      {/* Step 3: Save */}
      {step === 3 && (
        <Card>
          <CardHeader>
            <CardTitle>양식 저장</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>양식 이름</Label>
              <Input
                placeholder="예: ABC벤처스 투자심사보고서 양식"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
              />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>이전</Button>
              <Button onClick={handleSave}>저장하기</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
