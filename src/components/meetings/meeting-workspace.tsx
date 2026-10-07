"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { MAX_AUDIO_BYTES, MAX_LOCAL_AUDIO_BYTES, type MeetingMinutes, type MeetingTrack, type TranscriptSegment } from "@/lib/meetings/policy";

interface MeetingRow {
  id: string; title: string; occurredAt: string; participants: string; fileName: string;
  status: string; version: number; durationSeconds: number | null; errorCode: string | null;
  transcript?: TranscriptSegment[]; minutes?: MeetingMinutes | null;
  uploadMemo?: string;
}
const STATUS: Record<string, string> = { UPLOAD_PENDING: "업로드 대기", UPLOADING: "업로드 중", QUEUED: "전사 대기",
  PROCESSING: "전사·회의록 작성 중", DRAFT: "검토할 초안", APPROVED: "검토 확정", FAILED: "오디오 검증 중단",
  UNKNOWN: "처리 결과 확인 필요", UNKNOWN_UPLOAD: "업로드 결과 확인 필요", CANCELLED: "삭제됨" };
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const fieldClass = "space-y-1.5 text-sm";
async function result(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "처리 결과를 확인하지 못했습니다.");
  return body;
}
export function MeetingWorkspace({ track, dealId, canWrite, canUpload, canDelete, mode, maxMinutes, monthlyMinutes, initialMeetingId, referenceVersion }:
  { track: MeetingTrack; dealId: string; canWrite: boolean; canUpload: boolean; canDelete: boolean; mode: "local" | "vercel-blob" | "s3"; maxMinutes: number; monthlyMinutes: number; initialMeetingId?: string; referenceVersion?: number }) {
  const endpoint = `/api/meetings/${track}/${dealId}`;
  const [rows, setRows] = useState<MeetingRow[]>([]), [selected, setSelected] = useState<MeetingRow | null>(null);
  const [minutes, setMinutes] = useState<MeetingMinutes | null>(null), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState(""), [file, setFile] = useState<File | null>(null), [consent, setConsent] = useState(false);
  const [title, setTitle] = useState(""), [participants, setParticipants] = useState("");
  const [uploadMemo, setUploadMemo] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  const audio = useRef<HTMLAudioElement>(null), selectionEpoch = useRef(0), alive = useRef(true);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const body = await result(await fetch(endpoint, { cache: "no-store", signal }));
    if (alive.current && !signal?.aborted) setRows(body.data);
  }, [endpoint]);
  useEffect(() => {
    alive.current = true;
    selectionEpoch.current++;
    const controller = new AbortController();
    refresh(controller.signal).catch(() => { if (!controller.signal.aborted) setError("회의 목록을 불러오지 못했습니다. 다시 조회해주세요."); });
    return () => { alive.current = false; controller.abort(); };
  }, [refresh]);
  const open = useCallback(async (id: string, replaceEditor = true) => {
    const epoch = ++selectionEpoch.current;
    try {
      const body = await result(await fetch(`${endpoint}/${id}`, { cache: "no-store" }));
      if (!alive.current || epoch !== selectionEpoch.current) return;
      setSelected(body.data);
      if (replaceEditor) setMinutes(body.data.minutes);
      setError("");
    } catch (problem) { if (alive.current && epoch === selectionEpoch.current) setError(problem instanceof Error ? problem.message : "회의를 다시 조회해주세요."); }
  }, [endpoint]);
  useEffect(() => {
    if (initialMeetingId) void open(initialMeetingId);
  }, [initialMeetingId, open]);
  useEffect(() => {
    if (!selected || !["QUEUED", "PROCESSING", "UPLOADING"].includes(selected.status)) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      if (!cancelled) { await open(selected.id); await refresh().catch(() => {}); }
    }, 5000);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [selected, open, refresh]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !consent || busy) return;
    setBusy(true); setError(""); setNotice("");
    let meetingId: string | undefined;
    try {
      const cap = mode === "local" ? MAX_LOCAL_AUDIO_BYTES : MAX_AUDIO_BYTES;
      if (file.size > cap) throw new Error(`선택한 저장 방식에서는 ${cap / 1024 / 1024}MiB까지 업로드할 수 있습니다.`);
      const body = await result(await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: crypto.randomUUID(), title: title.trim() || file.name.slice(0, 120), occurredAt: new Date(occurredAt).toISOString(),
          participants, uploadMemo, consentConfirmed: true, fileName: file.name, mimeType: file.type, fileSize: file.size }) }));
      meetingId = body.data.id;
      const url = `${endpoint}/${meetingId}/upload`;
      if (mode === "vercel-blob") {
        const blob = await upload(body.pathname, file, { access: "private", handleUploadUrl: url, multipart: true });
        await result(await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "meeting.complete", blobUrl: blob.url }) }));
      } else {
        const form = new FormData(); form.append("file", file);
        await result(await fetch(url, { method: "POST", body: form }));
      }
      setNotice("업로드했습니다. 전사 완료 후 초안을 검토해주세요.");
      await open(meetingId!); await refresh();
    } catch (problem) {
      setError(`${problem instanceof Error ? problem.message : "업로드 결과를 확인하지 못했습니다."}${meetingId ? " 회의 목록에서 상태를 확인하세요. 같은 파일을 바로 다시 올리지 마세요." : ""}`);
      await refresh().catch(() => {});
    } finally { if (alive.current) setBusy(false); }
  }
  async function save(action: "SAVE" | "APPROVE") {
    if (!selected || !minutes || busy) return;
    setBusy(true); setError("");
    try {
      const body = await result(await fetch(`${endpoint}/${selected.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: selected.version, action, minutes: { ...minutes,
          questions: minutes.questions.map(item => item.trim()).filter(Boolean),
          actions: minutes.actions.map(item => item.trim()).filter(Boolean) } }) }));
      if (!alive.current) return;
      setSelected(body.data); setMinutes(body.data.minutes);
      setNotice(action === "APPROVE" ? "검토한 회의록을 확정했습니다. 발언의 사실 여부는 별도 근거로 확인해주세요." : "수정 내용을 새 버전으로 저장했습니다.");
      await refresh();
    } catch (problem) { setError(problem instanceof Error ? problem.message : "저장 상태를 확인해주세요."); }
    finally { if (alive.current) setBusy(false); }
  }
  async function remove() {
    if (!selected || busy || !window.confirm("이 회의의 원본 오디오·전사·회의록을 삭제할까요? 이미 전사한 월 사용량은 유지됩니다.")) return;
    setBusy(true); setError("");
    try {
      await result(await fetch(`${endpoint}/${selected.id}`, { method: "DELETE" }));
      selectionEpoch.current++; setSelected(null); setMinutes(null); setNotice("회의 기록을 삭제했습니다."); await refresh();
    } catch (problem) { setError(problem instanceof Error ? problem.message : "삭제 상태를 확인해주세요."); }
    finally { if (alive.current) setBusy(false); }
  }
  return <div className="space-y-8">
    <p className="text-sm text-muted-foreground">파일당 {maxMinutes}분 · 월 {monthlyMinutes}분. 새 업로드는 파일당 최대 시간만큼 먼저 예약하고, 실제 오디오 길이 확인 후 정산합니다.</p>
    {error && <p role="alert" className="rounded-lg border border-destructive/40 p-4 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-lg border p-4 text-sm">{notice}</p>}
    {canUpload ? <form onSubmit={submit} className="space-y-4 rounded-xl border bg-card p-5">
      <h2 className="font-semibold">녹음 파일로 미팅 기록 만들기</h2>
      <p className="text-sm text-muted-foreground">휴대폰이나 회의 도구에서 녹음한 파일을 올리세요. 전사와 회의록 초안이 완성되면 수정하고 확정할 수 있습니다.</p>
      <label className="block space-y-1.5 text-sm">녹음 파일<Input type="file" accept=".mp3,.wav,.m4a,.mp4,.webm,.ogg" required disabled={busy} onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={fieldClass}>미팅 제목 · 선택<Input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} disabled={busy} placeholder="입력하지 않으면 파일명 사용" /></label>
        <label className={fieldClass}>미팅 일시<Input type="datetime-local" value={occurredAt} onChange={event => setOccurredAt(event.target.value)} required disabled={busy} /></label>
      </div>
      <label className="block space-y-1.5 text-sm">참가자 · 선택<Input value={participants} onChange={event => setParticipants(event.target.value)} maxLength={500} disabled={busy} placeholder="회사명, 이름 또는 역할" /></label>
      <label className="block space-y-1.5 text-sm">심사역 메모 · 선택<Textarea rows={3} value={uploadMemo} maxLength={3000} disabled={busy} onChange={event => setUploadMemo(event.target.value)} placeholder="중요한 논점, 확인할 숫자, 추가로 요청할 자료" /></label>
      <p className="text-xs text-muted-foreground">메모는 녹음 전사와 별도로 보관하며, AI가 녹음된 발언으로 처리하지 않습니다.</p>
      <p className="text-xs text-muted-foreground">오디오 전용 파일, {mode === "local" ? "4" : "24"}MiB 이하. 참가자 이름과 숫자는 전사 후 직접 확인해주세요.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required disabled={busy} className="mt-1" />녹음·외부 AI 처리를 알렸고 이 자료를 업로드하고 처리할 권한이 있음을 확인합니다.</label>
      <Button type="submit" disabled={busy || !file || !consent}>{busy ? "처리 중…" : "녹음 파일 업로드"}</Button>
    </form> : !canWrite && <p className="rounded-lg border p-4 text-sm">회의 기록 생성·편집에는 딜 편집 권한과 딜 소유자의 유효한 유료 구독이 필요합니다.</p>}
    <section className="space-y-3"><div className="flex items-center justify-between gap-3"><h2 className="font-semibold">최근 회의</h2><Button variant="outline" size="sm" disabled={busy} onClick={() => refresh().catch(() => setError("목록을 다시 조회해주세요."))}>목록 새로고침</Button></div>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">아직 등록된 회의가 없습니다.</p>}
      <div className="grid gap-3 sm:grid-cols-2">{rows.map(row => <button key={row.id} type="button" disabled={busy} onClick={() => open(row.id)} aria-pressed={selected?.id === row.id}
        className="rounded-lg border p-4 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><p className="font-medium">{row.title}</p><p className="mt-1 text-sm text-muted-foreground">{new Date(row.occurredAt).toLocaleString("ko-KR")} · {STATUS[row.status] ?? "상태 확인 필요"}</p></button>)}</div>
    </section>
    {selected && <section className="space-y-4 rounded-xl border p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{selected.title}</h2><p className="text-sm text-muted-foreground">{STATUS[selected.status] ?? "상태 확인 필요"} · 버전 {selected.version}</p></div><Button size="sm" variant="outline" disabled={busy} onClick={() => open(selected.id)}>다시 조회</Button></div>
      {selected.errorCode && <p className="text-sm text-amber-700">{selected.errorCode === "SUMMARY_UNAVAILABLE" ? "자동 요약을 완성하지 못했습니다. 전사는 보존되어 직접 검토할 수 있습니다." : "처리가 중단되었거나 결과가 불확실합니다. 새로 올리기 전에 운영자에게 이 회의의 상태 확인을 요청해주세요."}</p>}
      {selected.uploadMemo && <section className="space-y-2 border-t pt-4" aria-label="업로드 시 입력한 심사역 메모">
        <h3 className="font-medium">심사역 메모 · 업로드 시 입력</h3>
        <p className="text-xs text-muted-foreground">녹음된 발언과 별도로 입력한 참고 메모입니다.</p>
        <p className="whitespace-pre-wrap break-words text-sm">{selected.uploadMemo}</p>
      </section>}
      {selected.id === initialMeetingId && referenceVersion !== undefined && (selected.version !== referenceVersion || selected.status !== "APPROVED") && <p className="text-sm text-amber-800">보고서에서 참조한 버전 {referenceVersion}과 현재 기록의 버전·확정 상태가 다릅니다. 변경 내용을 검토하고 보고서 근거를 새로고침해주세요.</p>}
      {selected.status === "APPROVED" && <a className="inline-flex min-h-11 items-center rounded-md border px-4 text-sm" href={`${endpoint}/${selected.id}/export`}>확정 회의록 다운로드</a>}
      {!!selected.durationSeconds && <audio key={selected.id} ref={audio} controls preload="none" src={`${endpoint}/${selected.id}/audio`} className="w-full" aria-label="미팅 원본 녹음" />}
      {minutes && <div className="space-y-5">
        <label className="block space-y-1.5 text-sm">회의록<Textarea rows={10} value={minutes.summary} maxLength={12_000} readOnly={!canWrite || busy} onChange={event => setMinutes({ ...minutes, summary: event.target.value })} /></label>
        <div className="space-y-3"><h3 className="font-medium">투자 판단에 참고할 주장</h3><p className="text-xs text-muted-foreground">검토 확정은 회의록 내용에 대한 확인입니다. 회사의 발언을 독립적으로 검증한 사실로 간주하지 않습니다.</p>
          {minutes.claims.map((claim, index) => <div key={index} className="space-y-2 rounded-lg border p-3"><Button size="sm" variant="outline" onClick={() => { if (audio.current) { audio.current.currentTime = claim.start; void audio.current.play().catch(() => {}); } }}>{clock(claim.start)}–{clock(claim.end)} 구간 듣기</Button>
            <label className="block text-sm">주장<Textarea value={claim.text} maxLength={1000} readOnly={!canWrite || busy} onChange={event => setMinutes({ ...minutes, claims: minutes.claims.map((item, i) => i === index ? { ...item, text: event.target.value } : item) })} /></label>
            <label className="block space-y-1 text-sm">확인 상태<select className="block min-h-11 w-full rounded-md border bg-background px-3" value={claim.verification} disabled={!canWrite || busy}
              onChange={event => setMinutes({ ...minutes, claims: minutes.claims.map((item, i) => i === index ? { ...item, verification: event.target.value as typeof item.verification } : item) })}><option value="UNVERIFIED">회사 발언 · 미검증</option><option value="NEEDS_DATA">보완 자료 필요</option><option value="VERIFIED">사용자 확인 · 근거 입력 필요</option></select></label>
            <label className="block text-sm">확인 근거·보완 요청<Input value={claim.note} maxLength={1000} readOnly={!canWrite || busy} onChange={event => setMinutes({ ...minutes, claims: minutes.claims.map((item, i) => i === index ? { ...item, note: event.target.value } : item) })} /></label></div>)}
        </div>
        <label className="block text-sm">미확인 사항 · 한 줄에 하나<Textarea value={minutes.questions.join("\n")} readOnly={!canWrite || busy} onChange={event => setMinutes({ ...minutes, questions: event.target.value.split("\n") })} /></label>
        <label className="block text-sm">다음 행동·보완 자료 · 한 줄에 하나<Textarea value={minutes.actions.join("\n")} readOnly={!canWrite || busy} onChange={event => setMinutes({ ...minutes, actions: event.target.value.split("\n") })} /></label>
        {canWrite && <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={busy} onClick={() => save("SAVE")}>수정 저장</Button><Button disabled={busy} onClick={() => save("APPROVE")}>검토 후 확정</Button></div>}
      </div>}
      {!!selected.transcript?.length && <details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">원본 전사 확인</summary><div className="mt-4 max-h-96 space-y-3 overflow-y-auto">{selected.transcript.map((segment, index) => <p key={index} className="text-sm"><span className="mr-2 text-muted-foreground">{clock(segment.start)}</span>{segment.text}</p>)}</div></details>}
      {canDelete && <Button variant="outline" disabled={busy || ["PROCESSING", "UPLOADING"].includes(selected.status)} onClick={remove}>이 회의 기록 삭제</Button>}
    </section>}
  </div>;
}
