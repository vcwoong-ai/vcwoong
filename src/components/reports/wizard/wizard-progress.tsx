"use client";

const STEPS = ["자료 업로드", "섹터 + 양식 선택", "보고서 생성"];

interface WizardProgressProps {
  currentStep: 1 | 2 | 3;
}

export function WizardProgress({ currentStep }: WizardProgressProps) {
  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((label, i) => {
        const stepNum = (i + 1) as 1 | 2 | 3;
        const done = currentStep > stepNum;
        const active = currentStep === stepNum;
        return (
          <div key={i} className="flex items-center">
            <div className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-colors ${
                  done
                    ? "bg-blue-600 border-blue-600 text-white"
                    : active
                    ? "border-blue-600 text-blue-600 bg-white"
                    : "border-gray-300 text-gray-400 bg-white"
                }`}
              >
                {done ? "✓" : stepNum}
              </div>
              <span
                className={`text-xs whitespace-nowrap ${
                  active ? "text-blue-600 font-medium" : "text-gray-400"
                }`}
              >
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-16 h-0.5 mb-5 mx-1 ${
                  done ? "bg-blue-600" : "bg-gray-200"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
