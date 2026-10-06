"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DataRoomDocumentView } from "@/lib/pe/pe-data-room-view-model";

type ParseSummary = Pick<DataRoomDocumentView, "parseStatus" | "parseRetryAllowed" | "parseAttempts">;

/** An uncertain POST is reconciled by an explicit read, never by an automatic POST replay. */
export function PeDocumentParseRetry({ dealId, document, canEdit, onRecovered }: {
  dealId: string;
  document: DataRoomDocumentView;
  canEdit: boolean;
  onRecovered: () => void;
}) {
  const [summary, setSummary] = useState<ParseSummary>(document);
  const [pending, setPending] = useState(false);
  // Parent list state may be stale after closing the dialog or a lost response.
  // Every reopening must read the current lease/counter before enabling a POST.
  const [uncertain, setUncertain] = useState(document.parseStatus !== "complete");
  const [message, setMessage] = useState<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  const permitted = useRef(canEdit);
  permitted.current = canEdit;
  useEffect(() => () => operation.current?.abort(), []);

  async function run(retry: boolean) {
    if (operation.current || (retry && (!permitted.current || uncertain || !summary.parseRetryAllowed))) return;
    const controller = new AbortController();
    operation.current = controller;
    setPending(true);
    setMessage(null);
    try {
      if (retry) {
        // Set before dispatch: a timeout or lost response must be checked through GET.
        setUncertain(true);
        const response = await fetch(`/api/ma-deals/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(document.id)}/retry-parse`, {
          method: "POST", signal: controller.signal, cache: "no-store",
        });
        if (!response.ok) throw new Error("retry");
      }
      const response = await fetch(`/api/ma-deals/${encodeURIComponent(dealId)}/documents`, { signal: controller.signal, cache: "no-store" });
      if (!response.ok) throw new Error("read");
      const body = await response.json() as { data?: { documents?: DataRoomDocumentView[] } };
      const current = body.data?.documents?.find(row => row.id === document.id);
      if (!current || !["complete", "unavailable", "processing", "unknown"].includes(current.parseStatus ?? "")) throw new Error("missing");
      if (controller.signal.aborted) return;
      setSummary(current);
      setUncertain(false);
      setMessage(current.parseStatus === "complete" ? "텍스트 추출을 확인했습니다. 아래에서 내용을 다시 확인해 주세요."
        : current.parseStatus === "processing" ? "텍스트 추출이 진행 중입니다. 잠시 후 상태를 다시 조회해 주세요."
        : "텍스트를 추출하지 못했습니다. 원본 파일은 유지됩니다. 남은 횟수가 있으면 다시 시도할 수 있습니다.");
      onRecovered();
    } catch {
      if (!controller.signal.aborted) {
        setUncertain(true);
        setMessage("추출 결과를 확인하지 못했습니다. 원본을 다시 업로드하지 말고 처리 상태를 조회해 주세요.");
      }
    } finally {
      if (!controller.signal.aborted) {
        operation.current = null;
        setPending(false);
      }
    }
  }

  if (summary.parseStatus === undefined || summary.parseStatus === "unknown") return null;
  if (summary.parseStatus === "complete" && !message) return null;
  return (
    <section aria-label="텍스트 추출 복구" className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm">
      <p>처리 상태를 확인한 뒤 저장된 원본에서 텍스트를 다시 추출할 수 있습니다. 원본 파일과 연결된 근거는 유지됩니다.</p>
      <p className="text-xs">재시도 {summary.parseAttempts ?? 0}/3회 · 이미지·스캔 문서의 텍스트 추출은 지원되지 않을 수 있습니다.</p>
      <div aria-live="polite" aria-busy={pending}>{message && <p role="status">{message}</p>}</div>
      <div className="flex flex-wrap gap-2">
        {canEdit && summary.parseRetryAllowed && !uncertain && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(true)}>{pending ? "확인 중…" : "텍스트 추출 다시 시도"}</Button>}
        {(uncertain || summary.parseStatus === "processing") && <Button size="sm" variant="outline" disabled={pending} onClick={() => run(false)}>추출 상태 조회</Button>}
      </div>
    </section>
  );
}
