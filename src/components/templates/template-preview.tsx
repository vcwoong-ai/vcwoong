"use client";

import type { SlideAnalysis, TemplateAnalysis } from "@/lib/template-parser/pptx-analyzer";
import type { FieldMapping } from "@/lib/template-parser/field-mapper";
import { cn } from "@/lib/utils";

const CONFIDENCE_COLOR: Record<string, string> = {
  high: "bg-green-200 border-green-400",
  medium: "bg-yellow-200 border-yellow-400",
  low: "bg-red-200 border-red-400",
};

function confidenceLevel(c: number) {
  if (c >= 0.8) return "high";
  if (c >= 0.6) return "medium";
  return "low";
}

interface SlidePreviewProps {
  slide: SlideAnalysis;
  slideSize: TemplateAnalysis["slideSize"];
  mappings: FieldMapping[];
  selectedId?: string;
  onSelect?: (id: string) => void;
}

function SlidePreview({ slide, slideSize, mappings, selectedId, onSelect }: SlidePreviewProps) {
  const SCALE = 300 / slideSize.w; // 300px 너비로 스케일
  const height = slideSize.h * SCALE;

  const mappingMap = new Map(
    mappings.filter((m) => m.slideNum === slide.slideNum).map((m) => [m.elementId, m])
  );

  return (
    <div
      className="relative border border-gray-300 bg-white rounded overflow-hidden"
      style={{ width: 300, height }}
    >
      <span className="absolute top-1 left-1 text-[9px] text-gray-400 z-10">
        슬라이드 {slide.slideNum}
      </span>
      {slide.elements.map((el) => {
        const mapping = mappingMap.get(el.id);
        const level = mapping ? confidenceLevel(mapping.confidence) : undefined;
        return (
          <div
            key={el.id}
            className={cn(
              "absolute border text-[7px] overflow-hidden cursor-pointer truncate",
              mapping && mapping.mappedField !== "skip"
                ? CONFIDENCE_COLOR[level!]
                : "border-transparent"
            )}
            style={{
              left: el.position.x * SCALE,
              top: el.position.y * SCALE,
              width: el.position.w * SCALE,
              height: el.position.h * SCALE,
            }}
            title={mapping ? `${mapping.mappedSection}.${mapping.mappedField} (${(mapping.confidence * 100).toFixed(0)}%)` : el.textContent}
            onClick={() => onSelect?.(el.id)}
          >
            {el.textContent?.slice(0, 40)}
          </div>
        );
      })}
    </div>
  );
}

interface TemplatePreviewProps {
  analysis: TemplateAnalysis;
  mappings: FieldMapping[];
  selectedId?: string;
  onSelectElement?: (id: string) => void;
}

export function TemplatePreview({
  analysis,
  mappings,
  selectedId,
  onSelectElement,
}: TemplatePreviewProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-green-200 border border-green-400 inline-block" />
          높은 신뢰도 (80%+)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-yellow-200 border border-yellow-400 inline-block" />
          보통 (60~79%)
        </span>
        <span className="flex items-center gap-1">
          <span className="w-3 h-3 rounded bg-red-200 border border-red-400 inline-block" />
          낮음 (&lt;60%)
        </span>
      </div>
      <div className="flex flex-wrap gap-4">
        {analysis.slides.map((slide) => (
          <SlidePreview
            key={slide.slideNum}
            slide={slide}
            slideSize={analysis.slideSize}
            mappings={mappings}
            selectedId={selectedId}
            onSelect={onSelectElement}
          />
        ))}
      </div>
    </div>
  );
}
