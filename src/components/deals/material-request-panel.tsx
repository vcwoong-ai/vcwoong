"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { materialRequestDraft, materialRequestItems } from "@/lib/material-request";
import type { VCMissingInformation } from "@/lib/vc-decision-types";

export function MaterialRequestPanel({ companyName, reportTitle, items }: {
  companyName: string; reportTitle: string; items: VCMissingInformation[];
}) {
  const requests = materialRequestItems(items);
  const [selected, setSelected] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  if (!requests.length) return null;
  return <section className="space-y-4 border-t border-slate-200 pt-6" aria-label="보완자료 요청 작성">
    <div><h3 className="font-semibold text-slate-900">다음 단계 · 보완자료 요청</h3>
      <p className="mt-1 text-sm text-slate-600">보고서의 미확인 사항 {requests.length}건 중 요청할 항목을 선택하세요. 초안은 직접 수정하고 복사할 수 있습니다.</p></div>
    <details open={requests.length <= 5}>
      <summary className="cursor-pointer text-sm font-medium">요청 항목 선택 · {selected.length}건 선택</summary>
      <div className="mt-3 max-h-80 space-y-3 overflow-y-auto">{requests.map(item => <label key={item.id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
        <input type="checkbox" className="mt-1 size-4 shrink-0" checked={selected.includes(item.id)} onChange={event => {
          setSelected(current => event.target.checked ? [...current, item.id] : current.filter(id => id !== item.id));
          setCopyStatus("");
        }} />
        <span className="min-w-0 break-words"><span className="font-medium text-slate-900">{item.title}</span>
          <span className="mt-1 block text-slate-600">필요한 자료: {item.evidence || "관련 원본 자료 확인 필요"}</span></span>
      </label>)}</div>
    </details>
    <Button variant="outline" size="sm" disabled={!selected.length} onClick={() => {
      setDraft(materialRequestDraft(companyName, reportTitle, requests.filter(item => selected.includes(item.id)))); setCopyStatus("");
    }}>{draft ? "선택 항목으로 초안 다시 작성" : "요청 초안 작성"}</Button>
    {draft && <div className="space-y-3">
      <label htmlFor="material-request-draft" className="block text-sm font-medium">보완자료 요청 초안</label>
      <Textarea id="material-request-draft" value={draft} rows={10} onChange={event => { setDraft(event.target.value); setCopyStatus(""); }} />
      <p className="text-xs text-slate-600">초안은 이 화면에서만 유지됩니다. 다시 작성하면 수정 내용이 교체됩니다. 메일 발송과 요청 이력 저장은 제공하지 않습니다.</p>
      <Button variant="outline" size="sm" disabled={!draft.trim()} onClick={async () => {
        try { await navigator.clipboard.writeText(draft); setCopyStatus("초안을 복사했습니다."); }
        catch { setCopyStatus("복사하지 못했습니다. 초안의 텍스트를 선택해 직접 복사해주세요."); }
      }}>초안 복사</Button>
      <p role="status" className="text-sm text-slate-600">{copyStatus}</p>
    </div>}
  </section>;
}
