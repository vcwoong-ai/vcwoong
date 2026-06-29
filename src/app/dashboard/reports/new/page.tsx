"use client";

import { useState } from "react";
import { WizardProgress } from "@/components/reports/wizard/wizard-progress";
import { StepUpload, type UploadedItem } from "@/components/reports/wizard/step-upload";
import { StepSectorTemplate } from "@/components/reports/wizard/step-sector-template";
import { StepGenerate } from "@/components/reports/wizard/step-generate";

type Step = 1 | 2 | 3;

export default function NewReportPage() {
  const [step, setStep] = useState<Step>(1);
  const [companyName, setCompanyName] = useState("");
  const [items, setItems] = useState<UploadedItem[]>([]);
  const [selectedSectors, setSelectedSectors] = useState<string[]>([]);

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold">새 투자심사보고서</h1>
        <p className="text-gray-500 text-sm mt-1">IR 자료를 업로드하면 AI가 보고서를 자동 생성합니다</p>
      </div>

      <WizardProgress currentStep={step} />

      {step === 1 && (
        <StepUpload
          companyName={companyName}
          onCompanyNameChange={setCompanyName}
          items={items}
          onItemsChange={setItems}
          onNext={() => setStep(2)}
        />
      )}

      {step === 2 && (
        <StepSectorTemplate
          selectedSectors={selectedSectors}
          onSectorsChange={setSelectedSectors}
          onPrev={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}

      {step === 3 && (
        <StepGenerate
          companyName={companyName}
          sectors={selectedSectors}
          onPrev={() => setStep(2)}
        />
      )}
    </div>
  );
}
