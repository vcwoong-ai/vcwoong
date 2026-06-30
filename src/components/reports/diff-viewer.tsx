"use client";

interface DiffViewerProps {
  originalLabel?: string;
  generatedLabel?: string;
  originalContent: string;
  generatedContent: string;
}

export function DiffViewer({
  originalLabel = "원본 양식",
  generatedLabel = "생성된 보고서",
  originalContent,
  generatedContent,
}: DiffViewerProps) {
  return (
    <div className="grid grid-cols-2 gap-4 h-full">
      <div className="flex flex-col">
        <div className="text-sm font-medium text-gray-600 mb-2 px-3">{originalLabel}</div>
        <div className="border rounded-lg p-4 bg-gray-50 flex-1 overflow-auto">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">{originalContent}</pre>
        </div>
      </div>
      <div className="flex flex-col">
        <div className="text-sm font-medium text-blue-600 mb-2 px-3">{generatedLabel}</div>
        <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/30 flex-1 overflow-auto">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-sans">{generatedContent}</pre>
        </div>
      </div>
    </div>
  );
}
