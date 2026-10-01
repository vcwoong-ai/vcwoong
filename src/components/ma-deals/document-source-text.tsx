"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { DocumentTextWindow } from "@/lib/document-text";
import { DOCUMENT_TEXT_WINDOW } from "@/lib/document-text";

export function DocumentSourceText({ dealId, documentId }: { dealId: string; documentId: string }) {
  const [data, setData] = useState<DocumentTextWindow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);

  async function load(offset: number) {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ma-deals/${encodeURIComponent(dealId)}/documents/${encodeURIComponent(documentId)}/text?offset=${offset}`, { signal: controller.signal, cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 401 ? "로그인 후 다시 확인해 주세요." : "자료를 불러오지 못했습니다. 접근 권한과 자료 상태를 확인해 주세요.");
      const json = await res.json() as { data: DocumentTextWindow };
      if (!controller.signal.aborted) setData(json.data);
    } catch (cause) {
      if (!controller.signal.aborted) {
        setData(null);
        setError(cause instanceof Error ? cause.message : "자료를 불러오지 못했습니다.");
      }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <section aria-label="문서 파싱 텍스트" className="min-w-0 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <h3 className="font-semibold text-slate-900">문서 내용 확인</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">업로드 자료에서 추출한 텍스트입니다. 표·페이지 배치는 원본과 다를 수 있으며, 열람만으로 근거 검증이나 검토가 완료되지 않습니다.</p>
      <div aria-live="polite" aria-busy={loading}>
        {loading && <p className="mt-3 text-sm text-slate-600" role="status">텍스트를 불러오는 중…</p>}
        {error && <p className="mt-3 text-sm text-red-700" role="alert">{error}</p>}
        {!data && <Button variant="outline" size="sm" className="mt-3" disabled={loading} onClick={() => load(0)}>{error ? "다시 불러오기" : "파싱 텍스트 보기"}</Button>}
        {data && !data.available && <p className="mt-3 text-sm text-slate-600">추출된 텍스트가 없습니다. 이미지·스캔 자료이거나 파싱되지 않은 자료일 수 있습니다.</p>}
        {data?.available && (
          <>
            <p data-testid="document-source-range" className="mt-3 text-xs text-slate-500">{data.start + 1}–{data.end}자 · {data.hasMore ? "뒤에 내용이 더 있습니다" : "텍스트 끝"}</p>
            <pre data-testid="document-source-text" tabIndex={0} aria-label="추출된 문서 텍스트" className="mt-2 max-h-[32dvh] overflow-y-auto whitespace-pre-wrap [overflow-wrap:anywhere] rounded-md border border-slate-200 bg-white p-3 font-sans text-sm leading-6 text-slate-800">{data.text}</pre>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={loading || data.start === 0} onClick={() => load(Math.max(0, data.start - DOCUMENT_TEXT_WINDOW))}>이전 부분</Button>
              <Button variant="outline" size="sm" disabled={loading || !data.hasMore} onClick={() => load(data.end)}>다음 부분</Button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
