"use client";

import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";

/**
 * IC Memo 내보내기(PR #108) — 새 계산을 하지 않는다. 서버의
 * `/api/ma-deals/[id]/ic-memo` route가 IC 화면과 정확히 같은
 * `buildPEICDecision()`(pe-ic-decision.ts)을 호출해 만든 마크다운을
 * `generateMarkdownDOCX()`/`generateMarkdownPPTX()`(기존 범용 변환기,
 * docx-export.ts/pptx-export.ts, LP 리포트 등에서 이미 쓰는 것과 동일 —
 * VC 전용 exporter를 복제하지 않음)로 변환해 파일로 내려줄 뿐이다.
 */
export function MaDealIcMemoExport({ maDealId }: { maDealId: string }) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" asChild>
        <a href={`/api/ma-deals/${maDealId}/ic-memo?format=docx`}>
          <FileDown className="w-3.5 h-3.5 mr-1.5" />
          IC 메모 DOCX
        </a>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href={`/api/ma-deals/${maDealId}/ic-memo?format=pptx`}>
          <FileDown className="w-3.5 h-3.5 mr-1.5" />
          IC 메모 PPTX
        </a>
      </Button>
    </div>
  );
}
