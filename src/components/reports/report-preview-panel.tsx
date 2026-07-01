"use client";

import { Markdown } from "@/components/ui/markdown";

interface Section {
  title: string;
  content: string;
  order: number;
}

export function ReportPreviewPanel({ sections }: { sections: Section[] }) {
  const sorted = [...sections].sort((a, b) => a.order - b.order);
  const fullContent = sorted
    .filter((s) => s.content)
    .map((s) => `## ${s.title}\n\n${s.content}`)
    .join("\n\n---\n\n");

  return (
    <div className="sticky top-6">
      <div className="border rounded-xl bg-white shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b bg-slate-50">
          <h3 className="text-sm font-semibold text-gray-700">전체 미리보기</h3>
          <p className="text-xs text-gray-400 mt-0.5">보내기 형식 미리보기</p>
        </div>
        <div className="p-4 max-h-[calc(100vh-8rem)] overflow-y-auto text-sm">
          {fullContent ? (
            <Markdown content={fullContent} />
          ) : (
            <p className="text-gray-400 italic text-sm">내용이 없습니다</p>
          )}
        </div>
      </div>
    </div>
  );
}
