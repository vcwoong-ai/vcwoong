"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { WizardProgress } from "@/components/reports/wizard/wizard-progress";
import { StepUpload, type UploadedItem } from "@/components/reports/wizard/step-upload";
import { StepSectorTemplate } from "@/components/reports/wizard/step-sector-template";
import { StepGenerate } from "@/components/reports/wizard/step-generate";
import { DealSector } from "@prisma/client";
import { PERSONA_TO_SECTOR, type AgentPersonaId } from "@/prompts/system-prompts";

const WIZARD_STEPS = ["자료 업로드", "섹터 선택", "보고서 생성"];

function NewReportContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepParam = Number(searchParams.get("step") || "1");

  const [step, setStep] = useState(stepParam);
  const [companyName, setCompanyName] = useState("");
  const [uploadedItems, setUploadedItems] = useState<UploadedItem[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>(["bio"]);
  const [dealId, setDealId] = useState<string | undefined>();

  function handleStep1Next() {
    // The deal is created in step 2, once the sector is actually known.
    setStep(2);
  }

  async function handleStep2Next() {
    const sector =
      PERSONA_TO_SECTOR[selectedAgents[0] as AgentPersonaId] ?? DealSector.GENERAL;

    try {
      if (dealId) {
        // Agent selection may have changed after the deal was created.
        await fetch(`/api/deals/${dealId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sector }),
        });
      } else {
        const res = await fetch("/api/deals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: companyName, companyName, sector }),
        });
        const data = await res.json();
        if (data.data?.id) setDealId(data.data.id);
      }
    } catch {
      // Continue even if deal creation fails in demo mode
    }
    setStep(3);
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← 대시보드로
          </button>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">새 보고서 생성</h1>
        </div>

        <WizardProgress currentStep={step} steps={WIZARD_STEPS} />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{WIZARD_STEPS[step - 1]}</CardTitle>
          </CardHeader>
          <CardContent>
            {step === 1 && (
              <StepUpload
                companyName={companyName}
                onCompanyNameChange={setCompanyName}
                uploadedItems={uploadedItems}
                onItemsChange={setUploadedItems}
                onNext={handleStep1Next}
              />
            )}
            {step === 2 && (
              <StepSectorTemplate
                selectedAgents={selectedAgents}
                onAgentsChange={setSelectedAgents}
                suggestedAgent="bio"
                onBack={() => setStep(1)}
                onNext={handleStep2Next}
              />
            )}
            {step === 3 && (
              <StepGenerate
                dealId={dealId}
                companyName={companyName}
                selectedAgents={selectedAgents}
                uploadedItems={uploadedItems}
                onBack={() => setStep(2)}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function NewReportPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center">로딩 중...</div>}>
      <NewReportContent />
    </Suspense>
  );
}
