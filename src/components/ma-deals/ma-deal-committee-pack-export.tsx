"use client";

import { Button } from "@/components/ui/button";
import { FileDown, Printer } from "lucide-react";

/**
 * Committee Pack 내보내기(PR #110) — 새 계산을 하지 않는다. 서버의
 * `/api/ma-deals/[id]/committee-pack/export` route가 화면과 정확히 같은
 * `buildPECommitteePack()`(pe-committee-pack-loader.ts)을 호출해 만든
 * 마크다운을 `generateMarkdownDOCX()`/`generateMarkdownPPTX()`(기존 범용
 * 변환기 — IC Memo 등에서 이미 쓰는 것과 동일, VC 전용 exporter를
 * 복제하지 않음)로 변환해 파일로 내려줄 뿐이다.
 */
export function MaDealCommitteePackExport({ maDealId }: { maDealId: string }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant="outline" size="sm" asChild>
        <a href={`/ma-deals/${maDealId}/committee-pack/print`} target="_blank" rel="noreferrer">
          <Printer className="w-3.5 h-3.5 mr-1.5" />
          인쇄 / PDF
        </a>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href={`/api/ma-deals/${maDealId}/committee-pack/export?format=docx`}>
          <FileDown className="w-3.5 h-3.5 mr-1.5" />
          위원회 자료 DOCX
        </a>
      </Button>
      <Button variant="outline" size="sm" asChild>
        <a href={`/api/ma-deals/${maDealId}/committee-pack/export?format=pptx`}>
          <FileDown className="w-3.5 h-3.5 mr-1.5" />
          위원회 자료 PPTX
        </a>
      </Button>
    </div>
  );
}
