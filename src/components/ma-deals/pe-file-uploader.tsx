"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MA_DOCUMENT_TYPE_LABEL } from "@/lib/pe/ma-deal-labels";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES = ["MANAGEMENT_ACCOUNTS", "DD_MATERIAL", "FINANCIAL_MODEL", "CONTRACT", "OTHER"] as const;
type UploadOutcome = "idle" | "uncertain" | "not_found" | "ready";
type UploadView = { status: string; uploadId: string; id?: string; parseStatus?: string };

export function PeFileUploader({ dealId, canEdit, onUploaded }: {
  dealId: string;
  canEdit: boolean;
  onUploaded: () => void | boolean | Promise<void | boolean>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState<typeof TYPES[number]>("DD_MATERIAL");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<UploadOutcome>("idle");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const operation = useRef<string | null>(null);
  const pending = useRef(false);
  const epoch = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const cancelRequest = useCallback(() => {
    epoch.current++; controller.current?.abort(); pending.current = false;
  }, []);
  useEffect(() => {
    setFile(null); setBusy(false); setOutcome("idle"); setError(null); setNotice(null);
    operation.current = null;
    if (fileInput.current) fileInput.current.value = "";
    return cancelRequest;
  }, [dealId, canEdit, cancelRequest]);

  const acceptView = async (view: UploadView, isCurrent: () => boolean) => {
    if (!view || view.uploadId !== operation.current) throw new Error("Upload operation mismatch");
    if (view?.status === "ready" && typeof view.id === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(view.id)
      && ["complete", "unavailable"].includes(view.parseStatus ?? "")) {
      setOutcome("ready"); setError(null);
      const savedNotice = view.parseStatus === "complete"
        ? "자료를 저장하고 텍스트를 추출했습니다. 문서 내용과 연결 근거를 확인해 주세요."
        : "자료 파일은 저장되었지만 텍스트 추출은 완료되지 않았습니다. 원본을 확인해 주세요.";
      setNotice(savedNotice);
      setFile(null); operation.current = null;
      if (fileInput.current) fileInput.current.value = "";
      try {
        const refreshed = await onUploaded();
        if (isCurrent() && refreshed === false) setNotice(`${savedNotice} 목록 조회가 실패했습니다. 자료 목록을 다시 조회해 주세요.`);
      } catch {
        if (isCurrent()) setNotice(`${savedNotice} 목록 조회가 실패했습니다. 자료 목록을 다시 조회해 주세요.`);
      }
      return;
    }
    if (view?.status === "not_found") {
      setOutcome("not_found");
      setError("등록된 업로드를 아직 찾지 못했습니다. 같은 업로드 번호로만 다시 전송할 수 있습니다.");
    } else {
      setOutcome("uncertain");
      setError(view?.status === "processing"
        ? "자료 저장 처리 중입니다. 다시 업로드하지 말고 잠시 후 상태를 확인해 주세요."
        : "업로드 결과를 확인하지 못했습니다. 다시 업로드하지 말고 상태를 확인해 주세요. 확인되지 않는 경우 관리자에게 문의해 주세요.");
    }
  };

  const run = async (checkOnly: boolean) => {
    if (!canEdit || pending.current || !operation.current || (!checkOnly && (!file || outcome === "uncertain"))) return;
    pending.current = true;
    const attempt = ++epoch.current;
    const request = new AbortController(); controller.current = request;
    const isCurrent = () => !request.signal.aborted && attempt === epoch.current;
    setBusy(true); setError(null);
    try {
      let response: Response;
      if (checkOnly) {
        response = await fetch(`/api/ma-deals/${dealId}/documents?uploadId=${encodeURIComponent(operation.current)}`, { cache: "no-store", signal: request.signal });
      } else {
        const body = new FormData();
        body.append("file", file!); body.append("type", type); body.append("uploadId", operation.current);
        response = await fetch(`/api/ma-deals/${dealId}/documents`, { method: "POST", body, signal: request.signal });
      }
      if (!isCurrent()) return;
      if (!response.ok) {
        if (!checkOnly && [400, 401, 403, 404, 413, 415].includes(response.status)) {
          setOutcome("idle");
          setError(response.status === 401 ? "로그인이 만료되었습니다. 다시 로그인해 주세요."
            : response.status === 403 || response.status === 404 ? "이 딜에 자료를 업로드할 권한을 확인해 주세요."
            : "파일 종류·크기·자료 유형을 확인해 주세요. 파일은 4MiB 이하여야 합니다.");
          return;
        }
        throw new Error("Upload result unavailable");
      }
      const json = await response.json();
      if (!isCurrent()) return;
      await acceptView(json.data, isCurrent);
    } catch {
      if (isCurrent()) {
        setOutcome("uncertain");
        setError("업로드 결과를 확인하지 못했습니다. 같은 자료를 다시 업로드하지 말고 업로드 상태를 확인해 주세요.");
      }
    } finally {
      if (isCurrent()) { pending.current = false; controller.current = null; setBusy(false); }
    }
  };

  if (!canEdit) return null;
  const locked = busy || outcome === "uncertain" || outcome === "not_found";
  return <section className="space-y-3 rounded-lg border bg-white p-4" aria-label="PE 자료 업로드">
    <h3 className="font-medium">자료 추가</h3>
    <p className="text-sm text-muted-foreground">PDF·DOCX·PPTX·XLSX·TXT, 파일당 최대 4MiB. 텍스트 추출과 근거 검토는 파일 저장 후 별도로 확인해 주세요.</p>
    <label className="block text-sm">자료 유형
      <select aria-label="자료 유형" className="mt-1 w-full rounded-md border p-2" disabled={locked} value={type} onChange={event => setType(event.target.value as typeof TYPES[number])}>
        {TYPES.map(value => <option key={value} value={value}>{MA_DOCUMENT_TYPE_LABEL[value]}</option>)}
      </select>
    </label>
    <label className="block text-sm">파일 선택
      <input ref={fileInput} aria-label="PE 업로드 파일" className="mt-1 block w-full min-w-0 text-sm" type="file" accept=".pdf,.docx,.pptx,.xlsx,.txt" disabled={locked} onChange={event => {
        const selected = event.target.files?.[0] ?? null;
        setNotice(null); setError(null); setOutcome("idle"); operation.current = null; setFile(null);
        if (!selected) return;
        if (selected.size <= 0 || selected.size > MAX_BYTES || !/\.(pdf|docx|pptx|xlsx|txt)$/i.test(selected.name)) {
          setError("지원하는 파일을 선택해 주세요. 파일은 비어 있지 않고 4MiB 이하여야 합니다."); event.target.value = ""; return;
        }
        operation.current = crypto.randomUUID(); setFile(selected);
      }} />
    </label>
    {error && <div role="alert" data-testid="pe-upload-error" className="text-sm text-amber-900">{error}</div>}
    {notice && <p role="status" data-testid="pe-upload-status" className="text-sm">{notice}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={busy || !file || outcome === "uncertain" || outcome === "not_found"} onClick={() => run(false)}>{busy ? "확인 중..." : "자료 업로드"}</Button>
      {(outcome === "uncertain" || outcome === "not_found") && <Button type="button" variant="outline" disabled={busy} onClick={() => run(true)}>업로드 상태 확인</Button>}
      {outcome === "not_found" && <Button type="button" variant="outline" disabled={busy} onClick={() => run(false)}>같은 업로드 다시 전송</Button>}
    </div>
  </section>;
}
