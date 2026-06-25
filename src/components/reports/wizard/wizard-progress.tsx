"use client";

interface WizardProgressProps {
  currentStep: number;
  steps: string[];
}

export function WizardProgress({ currentStep, steps }: WizardProgressProps) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((step, idx) => (
        <div key={idx} className="flex items-center">
          <div className="flex flex-col items-center">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                idx + 1 < currentStep
                  ? "bg-green-500 text-white"
                  : idx + 1 === currentStep
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {idx + 1 < currentStep ? "✓" : idx + 1}
            </div>
            <span
              className={`mt-1 text-xs ${
                idx + 1 === currentStep ? "text-blue-600 font-semibold" : "text-gray-400"
              }`}
            >
              {step}
            </span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={`w-16 h-0.5 mb-5 mx-1 ${
                idx + 1 < currentStep ? "bg-green-500" : "bg-gray-200"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}
