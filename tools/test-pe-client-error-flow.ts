/** Actual PE detail hooks with synthetic responses; no DB, browser, DART or AI. */
/* eslint-disable @typescript-eslint/no-explicit-any -- VM React hook and response ports are test-only dynamic boundaries. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
function deferred<T>() { let resolve!: (value:T)=>void; const promise=new Promise<T>(done=>{resolve=done;}); return {promise,resolve}; }
const tick=async()=>{for(let i=0;i<30;i++) await Promise.resolve();};
const response=(ok:boolean,data:any,status=ok?200:500)=>({ok,status,json:async()=>data});
class SyntheticUploadForm {
  fields = new Map<string, any>();
  append(key: string, value: any) { this.fields.set(key, value); }
  get(key: string) { return this.fields.get(key); }
}
let stage="PE hook setup";
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
/** Execute the real component with ordered hook slots and effect dependency cleanup. */
function clientHarness(file: string, exportName: string, fetcher: any, exposeCompare = false, formData?: any) {
  const slots: any[] = []; let index = 0, mounted = true, writesAfterUnmount = 0, search = "ids=synthetic-A";
  const queued: Array<() => void> = [], toasts: any[] = [], successes: any[] = []; let tree: any, refreshes = 0, resets = 0, uuidCount = 0;
  const equal = (left: any[], right: any[]) => Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, i) => Object.is(value, right[i]));
  // This card has no hooks: execute its real native select, preserving parent hook order.
  const jsx = (type: any, props: any): any => typeof type === "function" && type.name === "DealMiniCard" ? type(props) : ({ type, props });
  const react = {
    useState(initial: any) { const at = index++; if (!slots[at]) slots[at] = { kind: "state", value: typeof initial === "function" ? initial() : initial }; return [slots[at].value, (next: any) => { if (!mounted) writesAfterUnmount++; slots[at].value = typeof next === "function" ? next(slots[at].value) : next; }]; },
    useRef(initial: any) { const at = index++; return (slots[at] ??= { kind: "ref", value: { current: initial } }).value; },
    useMemo(fn: any, deps: any[]) { const at = index++; if (!slots[at] || !equal(slots[at].deps, deps)) slots[at] = { kind: "memo", value: fn(), deps }; return slots[at].value; },
    useCallback(fn: any, deps: any[]) { return react.useMemo(() => fn, deps); },
    useEffect(fn: any, deps: any[]) { const at = index++, previous = slots[at]; if (!previous || !equal(previous.deps, deps)) queued.push(() => { previous?.cleanup?.(); slots[at] = { kind: "effect", deps, cleanup: fn() }; }); }, Suspense: "Suspense",
  };
  const exports: any = {};
  const proxy = new Proxy({}, { get: (_target, key) => String(key) });
  const dimensions = ["marketSize", "team", "product", "businessModel", "financials", "moat"].map(key => ({ key, label: key }));
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  vm.runInNewContext(compiled + (exposeCompare ? "\nexports.__CompareContent = CompareContent;" : ""), { exports, Date, AbortController, DOMException, URLSearchParams, URL, FormData: SyntheticUploadForm, crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuidCount).padStart(12, "0")}` }, window: { location: { href: "http://localhost/synthetic" }, history: { replaceState() {} } }, fetch: fetcher,
    setTimeout: (fn: () => void) => { queueMicrotask(fn); return 1; }, clearTimeout() {}, console: { error() {}, warn() {}, log() {} }, require(name: string) {
      if (name === "react") return react; if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/navigation") return { useRouter: () => ({ refresh: () => refreshes++, push() {} }), useSearchParams: () => new URLSearchParams(search) };
      if (name === "@/hooks/use-toast") return { useToast: () => ({ error: (...args: any[]) => toasts.push(args), success: (...args: any[]) => successes.push(args) }) };
      if (name === "react-hook-form") return { useForm: () => ({ register: () => ({}), control: {}, handleSubmit: (submit: any) => () => submit(formData), reset: () => resets++, setValue() {} }), useFieldArray: () => ({ fields: [], append() {}, remove() {} }) };
      if (name === "@/lib/pe/financial-types") return { CANONICAL_LINE_ITEMS: ["REVENUE"], LINE_ITEM_STATEMENT_TYPE: { REVENUE: "INCOME_STATEMENT" } };
      if (name === "@/hooks/use-confirm") return { useConfirm: () => async () => true };
      if (name === "@/lib/utils") return { cn: (...values: any[]) => values.filter(value => typeof value === "string").join(" ") };
      if (name === "@/lib/pe/ma-deal-labels") return { MA_DEAL_TYPE_LABEL: proxy, MA_DEAL_STATUS_LABEL: proxy, MA_ADJUSTMENT_STATUS_LABEL: proxy, MA_DOCUMENT_TYPE_LABEL: proxy };
      if (name === "@/lib/pe/ma-deal-queue") return { isMaDealTab: (value: string) => ["overview", "data-room", "ic-review-workflow", "committee-pack"].includes(value) };
      if (name === "@/lib/pe/ma-deal-dashboard") return { buildMaDealDashboard: () => ({ decisionReadiness: { factConflicts: [] }, lboEntryEbitda: { status: "unavailable" } }) };
      if (name === "@/lib/pe/pe-financials-view-model") return { computeFinancialDataQuality: () => ({}) };
      if (name === "@prisma/client") return { AgentType: proxy, ReportStatus: { PENDING: "PENDING", GENERATING: "GENERATING", DRAFT: "DRAFT", REVIEW: "REVIEW", FINAL: "FINAL", EXPORTED: "EXPORTED" }, DealSector: { GENERAL: "GENERAL", BIO: "BIO", IT: "IT", DEEPTECH: "DEEPTECH", MANUFACTURING: "MANUFACTURING", CONTENT: "CONTENT", FINTECH: "FINTECH", CONSUMER: "CONSUMER", CLIMATE: "CLIMATE" }, DealStage: proxy };
      if (name === "@/lib/deal-labels") return { SECTOR_LABEL: proxy, STAGE_LABEL: proxy };
      if (name === "@/lib/deal-scoring-shared") return { SCORE_DIMENSIONS: dimensions, scoreLabel: () => ({ label: "합성 점수" }) };
      if (name === "@/lib/ic-questions") return { QUESTION_CATEGORY_LABEL: proxy };
      if (name === "@/lib/brand") return { BRAND: { name: "합성 검증" } };
      if (name === "@/types") return { SECTION_META: Array.from({ length: 10 }, (_, index) => ({ key: `synthetic-section-${index}` })) };
      if (name === "@/agents/agent-meta") return { AGENT_META: [{ id: "GENERAL", name: "합성 전문 분야", desc: "합성", dot: "", icon: "SyntheticIcon", color: "" }] };
      if (name === "next/link") return { default: "Link" };
      if (name === "lucide-react" || name === "recharts" || name.startsWith("@/components/")) return proxy;
      throw new Error("Unexpected isolated client dependency");
    } });
  return {
    render(props: any = {}) { index = 0; tree = exports[exposeCompare ? "__CompareContent" : exportName](props); while (queued.length) queued.shift()!(); return tree; },
    search(value: string) { search = value; },
    states: () => slots.filter(slot => slot?.kind === "state").map(slot => slot.value),
    unmount() { for (const slot of slots) if (slot?.kind === "effect") slot.cleanup?.(); mounted = false; },
    postUnmountWrites: () => writesAfterUnmount, refreshes: () => refreshes, resets: () => resets, toasts, successes,
  };
}
function text(tree: any): string { if (Array.isArray(tree)) return tree.map(text).join(" "); if (tree === null || tree === undefined || typeof tree === "boolean") return ""; if (typeof tree !== "object") return String(tree); return text(tree.props?.children); }
function click(tree: any, label: string) { const button = nodes(tree).find(node => node.props?.onClick && text(node).trim() === label); assert(button, "synthetic UI action must exist"); return button.props.onClick(); }
const file = "src/app/ma-deals/[id]/ma-deal-detail-client.tsx";
const fixture = (id: string) => ({ maDeal: { id, userId: "synthetic-owner", name: id, companyName: id, status: "ACTIVE", dealType: "BUYOUT", teamId: null }, periods: [], ddCase: null, canEdit: true, currentUserId: "synthetic-owner" });
const documentBody = { documents: [], evidence: [], findings: [] };
const bodyFor = (url: string) => url.endsWith("/documents") ? documentBody : [];
const cases = [
  { endpoint: "/documents", testid: "pe-data-room-error", retry: "자료 목록 다시 조회" },
  { endpoint: "/evidence-requests", testid: "pe-evidence-requests-error", retry: "근거 요청 다시 조회" },
];
const periodFixture = (id: string) => ({ id, fiscalYear: 2024, periodType: "ANNUAL", currency: "KRW", lineItems: [], adjustments: [], normalizedSummary: {} });
function periodRefresh(tree: any) { const dialog = nodes(tree).find(node => node.type === "AddFinancialPeriodDialog"); assert(dialog); return dialog.props.onCreated(); }
async function financialCases() {
  for (const failure of [401, 403, 500, "network", "invalid"] as const) {
    stage = `financial saved list refresh failure ${failure}`; let reads = 0, writes = 0, recover = false;
    const subject = clientHarness(file, "MaDealDetailClient", async (url: string, options: any = {}) => {
      assert(url.endsWith("/financials")); if (options.method && options.method !== "GET") writes++;
      reads++; assert(options.signal); assert.equal(options.cache, "no-store");
      if (recover) return response(true, { data: [] });
      if (failure === "network") throw new Error("SYNTHETIC_PRIVATE_DETAIL");
      return failure === "invalid" ? response(true, { data: { invalid: true } }) : response(false, { error: "SYNTHETIC_PRIVATE_DETAIL" }, failure);
    });
    const props = { ...fixture("synthetic-A"), periods: [periodFixture("synthetic-retained-period")] };
    subject.render(props); const result = await periodRefresh(subject.render(props)); assert.equal(result, false);
    const failed = subject.render(props); assert(nodes(failed).some(node => node.props?.["data-testid"] === "pe-financial-read-error" && node.props.role === "alert"));
    assert(text(failed).includes("저장")); assert(!text(failed).includes("SYNTHETIC_PRIVATE_DETAIL"));
    assert(subject.states().some(value => Array.isArray(value) && value.some(row => row?.id === "synthetic-retained-period")), "failed GET preserves existing period rows");
    assert(!text(failed).includes("등록된 재무 데이터가 없습니다")); assert.equal(reads, 1); assert.equal(writes, 0);
    recover = true; await click(failed, "재무 목록 다시 조회"); await tick(); const restored = subject.render(props);
    assert.equal(reads, 2); assert.equal(writes, 0); assert(!nodes(restored).some(node => node.props?.["data-testid"] === "pe-financial-read-error"));
    assert(text(restored).includes("등록된 재무 데이터가 없습니다"), "successful empty GET may display true empty content"); subject.unmount();
  }
  for (const end of ["change-deal", "unmount"] as const) {
    stage = `financial late GET ${end}`; const held = deferred<any>(); let signal: AbortSignal | undefined;
    const subject = clientHarness(file, "MaDealDetailClient", async (_url: string, options: any) => { signal = options.signal; return held.promise; });
    const props = { ...fixture("synthetic-A"), periods: [periodFixture("synthetic-old-period")] }; subject.render(props);
    const pending = periodRefresh(subject.render(props)); await tick(); assert(signal);
    const changed = { ...fixture("synthetic-B"), periods: [periodFixture("synthetic-current-period")] };
    if (end === "unmount") subject.unmount(); else { subject.render(changed); subject.render(changed); }
    assert(signal.aborted); const before = JSON.stringify(subject.states()); held.resolve(response(true, { data: [] })); await pending; await tick();
    assert.equal(JSON.stringify(subject.states()), before); assert.equal(subject.postUnmountWrites(), 0); if (end !== "unmount") subject.unmount();
  }
}
async function financialDialogCases() {
  const dialogFile = "src/components/ma-deals/add-financial-period-dialog.tsx";
  const formData = { fiscalYear: "2024", periodType: "ANNUAL", startDate: "2024-01-01", endDate: "2024-12-31", currency: "KRW", lineItems: [{ lineItem: "REVENUE", value: "1" }] };
  const submit = (tree: any) => { const form = nodes(tree).find(node => node.type === "form"); assert(form); return form.props.onSubmit(); };
  for (const callbackResult of ["false", "reject"] as const) {
    stage = `financial POST succeeded but refresh callback ${callbackResult}`; let posts = 0, callbacks = 0;
    const subject = clientHarness(dialogFile, "AddFinancialPeriodDialog", async (_url: string, options: any) => {
      assert.equal(options.method, "POST"); posts++; assert.equal(JSON.parse(options.body).lineItems[0].value, 100_000_000);
      return response(true, { data: periodFixture("synthetic-saved-period") }, 201);
    }, false, formData);
    const props = { maDealId: "synthetic-A", onCreated: async () => { callbacks++; if (callbackResult === "reject") throw new Error("SYNTHETIC_PRIVATE_DETAIL"); return false; } };
    await submit(subject.render(props)); const tree = subject.render(props);
    assert.equal(posts, 1); assert.equal(callbacks, 1); assert.equal(subject.successes.length, 1); assert.equal(subject.resets(), 1);
    assert(!JSON.stringify(subject.toasts).includes("SYNTHETIC_PRIVATE_DETAIL")); assert(!JSON.stringify(subject.toasts).includes("재무 데이터 생성 실패"));
    assert(!text(tree).includes("SYNTHETIC_PRIVATE_DETAIL")); assert.equal(nodes(tree).find(node => node.type === "Dialog").props.open, false); subject.unmount();
  }
  stage = "financial same-event pending POST lock"; const held = deferred<any>(); let posts = 0;
  const subject = clientHarness(dialogFile, "AddFinancialPeriodDialog", async () => { posts++; return held.promise; }, false, formData);
  const props = { maDealId: "synthetic-A", onCreated: async () => true }; const tree = subject.render(props);
  const first = submit(tree), second = submit(tree); await tick(); assert.equal(posts, 1);
  held.resolve(response(true, { data: periodFixture("synthetic-saved-period") }, 201)); await Promise.all([first, second]); subject.unmount();
  for (const failure of ["network", "http500", "invalid-response", "non-json"] as const) {
    stage = `financial unknown save ${failure} cannot repeat POST`; let posts = 0, callbacks = 0;
    const subject = clientHarness(dialogFile, "AddFinancialPeriodDialog", async (_url: string, options: any) => {
      assert.equal(options.method, "POST"); posts++;
      if (failure === "network") throw new Error("SYNTHETIC_PRIVATE_DETAIL");
      if (failure === "http500") return response(false, { error: "<html>SYNTHETIC_PRIVATE_DETAIL</html>" });
      if (failure === "non-json") return { ok: true, status: 201, json: async () => { throw new Error("SYNTHETIC_PRIVATE_DETAIL"); } };
      if (failure === "invalid-response") return response(true, { data: {} }, 201);
      throw new Error("Unexpected fixture response");
    }, false, formData);
    const props = { maDealId: "synthetic-A", onCreated: async () => { throw new Error("Unexpected save-success callback"); }, onReload: async () => { callbacks++; return true; } };
    await submit(subject.render(props)); let failed = subject.render(props);
    assert(nodes(failed).some(node => node.props?.["data-testid"] === "pe-financial-save-error" && node.props.role === "alert"));
    assert(!text(failed).includes("SYNTHETIC_PRIVATE_DETAIL")); assert(!JSON.stringify(subject.toasts).includes("SYNTHETIC_PRIVATE_DETAIL"));
    await submit(failed); assert.equal(posts, 1);
    await click(failed, "저장 결과 조회"); failed = subject.render(props); assert.equal(callbacks, 1); assert.equal(posts, 1);
    await submit(failed); assert.equal(posts, 1, "GET refresh does not prove an uncertain POST failed or unlock duplicate creation"); subject.unmount();
  }
  for (const end of ["change-deal", "unmount"] as const) {
    stage = `financial saved POST late response ${end}`; const held = deferred<any>(); let signal: AbortSignal | undefined, callbacks = 0;
    const subject = clientHarness(dialogFile, "AddFinancialPeriodDialog", async (_url: string, options: any) => { signal = options.signal; return held.promise; }, false, formData);
    const props = { maDealId: "synthetic-A", onCreated: async () => { callbacks++; return true; }, onReload: async () => true };
    const pending = submit(subject.render(props)); await tick(); assert(signal);
    if (end === "unmount") subject.unmount(); else { subject.render({ ...props, maDealId: "synthetic-B" }); subject.render({ ...props, maDealId: "synthetic-B" }); }
    assert(signal.aborted); const before = JSON.stringify(subject.states()); held.resolve(response(true, {}, 201)); await pending; await tick();
    assert.equal(JSON.stringify(subject.states()), before); assert.equal(callbacks, 0); assert.equal(subject.successes.length, 0); assert.equal(subject.resets(), 0); assert.equal(subject.postUnmountWrites(), 0);
    if (end !== "unmount") subject.unmount();
  }
}
async function documentUploadCases() {
  const uploaderFile = "src/components/ma-deals/pe-file-uploader.tsx";
  const file = { name: "synthetic.txt", size: 10, type: "text/plain" };
  const select = (tree: any) => { const input = nodes(tree).find(node => node.type === "input" && node.props.type === "file"); assert(input); input.props.onChange({ target: { files: [file], value: "synthetic.txt" } }); };
  const ready = (parseStatus = "complete") => ({ status: "ready", uploadId: "00000000-0000-4000-8000-000000000001", id: "synthetic-saved-document", parseStatus });
  stage = "PE uploader same-event POST lock"; let posts = 0; const held = deferred<any>();
  const subject = clientHarness(uploaderFile, "PeFileUploader", async (_url: string, options: any) => { assert.equal(options.method, "POST"); posts++; return held.promise; });
  const props = { dealId: "synthetic-A", canEdit: true, onUploaded: async () => true }; subject.render(props); select(subject.render(props)); const tree = subject.render(props);
  const first = click(tree, "자료 업로드"), second = click(tree, "자료 업로드"); await tick(); assert.equal(posts, 1);
  held.resolve(response(true, { data: ready() }, 201)); await Promise.all([first, second]); subject.unmount();
  for (const refresh of ["false", "reject"] as const) {
    stage = `PE upload confirmed but list refresh ${refresh}`; let callbacks = 0;
    const subject = clientHarness(uploaderFile, "PeFileUploader", async () => response(true, { data: ready("unavailable") }, 201));
    const props = { dealId: "synthetic-A", canEdit: true, onUploaded: async () => { callbacks++; if (refresh === "reject") throw new Error("SYNTHETIC_PRIVATE_DETAIL"); return false; } };
    subject.render(props); select(subject.render(props)); await click(subject.render(props), "자료 업로드"); const saved = subject.render(props);
    assert.equal(callbacks, 1); assert(nodes(saved).some(node => node.props?.["data-testid"] === "pe-upload-status" && text(node).includes("파일은 저장") && text(node).includes("목록 조회가 실패")));
    assert(!nodes(saved).some(node => node.props?.["data-testid"] === "pe-upload-error")); assert(!text(saved).includes("SYNTHETIC_PRIVATE_DETAIL")); subject.unmount();
  }
  for (const failure of ["network", "http500", "malformed", "wrong-operation"] as const) {
    stage = `PE unknown upload ${failure} stable operation and GET-only check`; const operations: string[] = []; let reads = 0, callbacks = 0;
    const subject = clientHarness(uploaderFile, "PeFileUploader", async (url: string, options: any = {}) => {
      if (options.method === "POST") {
        operations.push(options.body.get("uploadId")); assert.equal(options.body.get("file"), file); assert.equal(options.body.get("type"), "DD_MATERIAL");
        if (operations.length > 1) return response(true, { data: ready() }, 200);
        if (failure === "network") throw new Error("SYNTHETIC_PRIVATE_DETAIL");
        return failure === "http500" ? response(false, { error: "SYNTHETIC_PRIVATE_DETAIL" }) : response(true, { data: failure === "wrong-operation" ? { ...ready(), uploadId: "00000000-0000-4000-8000-000000000002" } : { status: "ready" } });
      }
      reads++; assert(url.endsWith(`?uploadId=${operations[0]}`)); assert.equal(options.cache, "no-store"); return response(true, { data: { status: "not_found", uploadId: operations[0], retryAllowed: true } });
    });
    const props = { dealId: "synthetic-A", canEdit: true, onUploaded: async () => { callbacks++; return true; } };
    subject.render(props); select(subject.render(props)); await click(subject.render(props), "자료 업로드"); let failed = subject.render(props);
    assert(nodes(failed).some(node => node.props?.["data-testid"] === "pe-upload-error")); assert(!text(failed).includes("SYNTHETIC_PRIVATE_DETAIL"));
    assert(nodes(failed).find(node => node.type === "input" && node.props.type === "file").props.disabled);
    await click(failed, "자료 업로드"); assert.equal(operations.length, 1); assert.equal(callbacks, 0);
    await click(failed, "업로드 상태 확인"); failed = subject.render(props); assert.equal(reads, 1); assert.equal(operations.length, 1);
    await click(failed, "같은 업로드 다시 전송"); assert.equal(operations.length, 2); assert.equal(operations[0], operations[1]); assert.equal(callbacks, 1); subject.unmount();
  }
  for (const end of ["change-deal", "unmount"] as const) {
    stage = `PE uploader late POST ${end}`; const held = deferred<any>(); let signal: AbortSignal | undefined, callbacks = 0;
    const subject = clientHarness(uploaderFile, "PeFileUploader", async (_url: string, options: any) => { signal = options.signal; return held.promise; });
    const props = { dealId: "synthetic-A", canEdit: true, onUploaded: async () => { callbacks++; } }; subject.render(props); select(subject.render(props)); const pending = click(subject.render(props), "자료 업로드"); await tick();
    if (end === "unmount") subject.unmount(); else { subject.render({ ...props, dealId: "synthetic-B" }); subject.render({ ...props, dealId: "synthetic-B" }); }
    assert(signal?.aborted); const before = JSON.stringify(subject.states()); held.resolve(response(true, { data: ready() }, 201)); await pending;
    assert.equal(JSON.stringify(subject.states()), before); assert.equal(callbacks, 0); assert.equal(subject.postUnmountWrites(), 0); if (end !== "unmount") subject.unmount();
  }
  stage = "PE readonly uploader absent"; let forbidden = 0;
  const readonly = clientHarness(uploaderFile, "PeFileUploader", async () => { forbidden++; throw new Error("Unexpected readonly upload"); });
  assert.equal(readonly.render({ dealId: "synthetic-A", canEdit: false, onUploaded() {} }), null); assert.equal(forbidden, 0); readonly.unmount();
}
async function mutationPrivacyCases() {
  for (const mutation of ["dart", "archive"] as const) {
    stage = `PE ${mutation} fixed response privacy`;
    const subject = clientHarness(file, "MaDealDetailClient", async () => response(false, { error: "SYNTHETIC_PRIVATE_DETAIL", message: "<html>SYNTHETIC_PRIVATE_DETAIL</html>" }, 500));
    const props = fixture("synthetic-A"); subject.render(props); await click(subject.render(props), mutation === "dart" ? "DART에서 가져오기" : "딜 보관");
    assert(!JSON.stringify(subject.toasts).includes("SYNTHETIC_PRIVATE_DETAIL")); assert(!text(subject.render(props)).includes("SYNTHETIC_PRIVATE_DETAIL")); subject.unmount();
  }
  for (const mutation of ["dart", "archive"] as const) {
    const label = mutation === "dart" ? "DART에서 가져오기" : "딜 보관", method = mutation === "dart" ? "POST" : "PATCH";
    const retry = mutation === "dart" ? "DART 결과 목록 조회" : "딜 상태 다시 조회";
    stage = `PE ${mutation} unknown result read-only verification`; let mutations = 0, reads = 0; const requestedStatuses: string[] = [];
    const subject = clientHarness(file, "MaDealDetailClient", async (_url: string, options: any = {}) => {
      if (options.method === method) { mutations++; if (mutation === "archive") requestedStatuses.push(JSON.parse(options.body).status); throw new Error("SYNTHETIC_PRIVATE_DETAIL"); }
      reads++; return response(true, { data: mutation === "dart" ? [] : { id: "synthetic-A", status: "ARCHIVED" } });
    });
    const props = fixture("synthetic-A"); subject.render(props); await click(subject.render(props), label); let failed = subject.render(props);
    assert(nodes(failed).some(node => node.props?.["data-testid"] === (mutation === "dart" ? "pe-dart-import-error" : "pe-archive-error") && node.props.role === "alert"));
    assert.equal(mutations, 1); assert.equal(reads, 0); await click(failed, label); assert.equal(mutations, 1);
    await click(failed, retry); failed = subject.render(props); assert.equal(reads, 1); assert.equal(mutations, 1);
    if (mutation === "dart") { await click(failed, label); assert.equal(mutations, 1, "financial GET cannot prove a DART import was not executed"); }
    else { assert(nodes(failed).some(node => node.props?.onClick && text(node).trim() === "다시 활성화")); await click(failed, "다시 활성화"); assert.equal(mutations, 2); assert.deepEqual(requestedStatuses, ["ARCHIVED", "ACTIVE"], "verified GET status determines the next explicit owner action"); } subject.unmount();
    stage = `PE ${mutation} same-event mutation pending lock`; const held = deferred<any>(); let calls = 0;
    const locked = clientHarness(file, "MaDealDetailClient", async () => { calls++; return held.promise; }); locked.render(props); const tree = locked.render(props);
    const first = click(tree, label), second = click(tree, label); await tick(); assert.equal(calls, 1); locked.unmount(); held.resolve(response(false, {}, 500)); await Promise.all([first, second]); assert.equal(locked.postUnmountWrites(), 0);
    for (const end of ["change-deal", "unmount"] as const) {
      stage = `PE ${mutation} late mutation response ${end}`; const held = deferred<any>(); let signal: AbortSignal | undefined;
      const stale = clientHarness(file, "MaDealDetailClient", async (_url: string, options: any) => { signal = options.signal; return held.promise; }); stale.render(props); const pending = click(stale.render(props), label); await tick(); assert(signal);
      if (end === "unmount") stale.unmount(); else { stale.render(fixture("synthetic-B")); stale.render(fixture("synthetic-B")); }
      assert(signal.aborted); const before = JSON.stringify(stale.states()); held.resolve(response(false, { error: "SYNTHETIC_PRIVATE_DETAIL" }, 500)); await pending;
      assert.equal(JSON.stringify(stale.states()), before); assert.equal(stale.toasts.length, 0); assert.equal(stale.successes.length, 0); assert.equal(stale.refreshes(), 0); assert.equal(stale.postUnmountWrites(), 0); if (end !== "unmount") stale.unmount();
    }
  }
  stage = "PE confirmed DART import survives subsequent financial read failure"; let posts = 0, reads = 0;
  const confirmed = clientHarness(file, "MaDealDetailClient", async (_url: string, options: any = {}) => {
    if (options.method === "POST") { posts++; return response(true, { data: { maDealId: "synthetic-A", source: "DART", importedPeriods: 1, importedLineItems: 1, importedPeriodsDetail: [{ fiscalYear: 2024, periodType: "ANNUAL", periodId: "synthetic-period", lineItemsImported: 1, derivedMetricsAvailable: [] }], skippedPeriods: [], derivedMetricsAvailable: [] } }, 201); }
    reads++; return response(false, { error: "SYNTHETIC_PRIVATE_DETAIL" }, 500);
  });
  const props = fixture("synthetic-A"); confirmed.render(props); await click(confirmed.render(props), "DART에서 가져오기"); const saved = confirmed.render(props);
  assert.equal(posts, 1); assert.equal(reads, 1); assert.equal(confirmed.successes.length, 1);
  assert(nodes(saved).some(node => node.props?.["data-testid"] === "pe-financial-read-error")); assert(!nodes(saved).some(node => node.props?.["data-testid"] === "pe-dart-import-error")); assert(!text(saved).includes("SYNTHETIC_PRIVATE_DETAIL")); confirmed.unmount();
  stage = "PE readonly archive unavailable";
  const readonly = clientHarness(file, "MaDealDetailClient", async () => { throw new Error("Unexpected mutation"); });
  const readonlyProps = { ...fixture("synthetic-A"), canEdit: false }; readonly.render(readonlyProps);
  assert(!nodes(readonly.render(readonlyProps)).some(node => node.props?.onClick && text(node).trim() === "딜 보관")); readonly.unmount();
  stage = "PE shared writer keeps existing archive permission"; let sharedWrites = 0;
  const shared = clientHarness(file, "MaDealDetailClient", async (_url: string, options: any) => { assert.equal(options.method, "PATCH"); sharedWrites++; return response(true, { data: { id: "synthetic-A", status: "ARCHIVED" } }); });
  const sharedProps = { ...fixture("synthetic-A"), currentUserId: "synthetic-team-partner", canEdit: true }; shared.render(sharedProps);
  await click(shared.render(sharedProps), "딜 보관"); assert.equal(sharedWrites, 1); shared.unmount();
  stage = "PE zero imported DART periods cannot claim saved records";
  const noImports = clientHarness(file, "MaDealDetailClient", async (_url: string, options: any = {}) => options.method === "POST"
    ? response(true, { data: { maDealId: "synthetic-A", source: "DART", importedPeriods: 0, importedLineItems: 0, importedPeriodsDetail: [], skippedPeriods: [], derivedMetricsAvailable: [] } }, 201)
    : response(false, {}, 500));
  noImports.render(props); await click(noImports.render(props), "DART에서 가져오기"); const readFailed = noImports.render(props);
  const readError = nodes(readFailed).find(node => node.props?.["data-testid"] === "pe-financial-read-error"); assert(readError);
  assert(!text(readError).includes("재무 데이터는 저장")); noImports.unmount();
}
async function main() {
  for (const item of cases) {
    for (const failure of [401, 403, 500, "network", "invalid"] as const) {
      stage = `${item.testid} ${failure} fixed failure and explicit GET retry`; let reads = 0, writes = 0, recover = false;
      const subject = clientHarness(file, "MaDealDetailClient", async (url: string, options: any = {}) => {
        if (options.method && options.method !== "GET") writes++;
        if (!url.endsWith(item.endpoint)) return response(true, { data: bodyFor(url) });
        reads++; assert(options.signal); assert.equal(options.cache, "no-store");
        if (recover) return response(true, { data: bodyFor(url) });
        if (failure === "network") throw new Error("SYNTHETIC_PRIVATE_DETAIL");
        return failure === "invalid" ? response(true, { data: { invalid: true } }) : response(false, { error: "SYNTHETIC_PRIVATE_DETAIL" }, failure);
      });
      subject.search("tab=data-room"); const props = fixture("synthetic-A"); subject.render(props); await tick();
      let failed = subject.render(props); await tick(); failed = subject.render(props); await tick(); subject.render(props);
      assert.equal(reads, 1, "persistent errors cannot schedule automatic repeated GETs"); assert.equal(writes, 0);
      const tabs = nodes(failed).find(node => node.type === "Tabs" && node.props.onValueChange); assert(tabs);
      tabs.props.onValueChange("overview"); subject.render(props); await tick();
      tabs.props.onValueChange("data-room"); failed = subject.render(props); await tick(); failed = subject.render(props);
      assert.equal(reads, 1, "tab switching cannot silently repeat a failed request");
      assert(nodes(failed).some(node => node.props?.["data-testid"] === item.testid && node.props.role === "alert"));
      assert(!text(failed).includes("SYNTHETIC_PRIVATE_DETAIL"));
      const room = nodes(failed).find(node => node.type === "TabsContent" && node.props.value === "data-room"); assert(room);
      assert(!nodes(room).some(node => node.type === "MaDealDataRoom"), "failed reads must not render an empty data room");
      recover = true; await click(failed, item.retry); await tick(); const restored = subject.render(props);
      assert.equal(reads, 2); assert.equal(writes, 0); assert(!nodes(restored).some(node => node.props?.["data-testid"] === item.testid));
      assert(nodes(restored).some(node => node.type === "MaDealDataRoom"), "a successful empty response is valid data room content"); subject.unmount();
    }
    for (const end of ["change-deal", "unmount"] as const) {
      stage = `${item.testid} late success ${end}`; const held = deferred<any>(); let signal: AbortSignal | undefined;
      const subject = clientHarness(file, "MaDealDetailClient", async (url: string, options: any = {}) => {
        if (url.includes("synthetic-A") && url.endsWith(item.endpoint)) { signal = options.signal; return held.promise; }
        return response(true, { data: bodyFor(url) });
      });
      subject.search("tab=data-room"); subject.render(fixture("synthetic-A")); await tick(); assert(signal);
      const changed = fixture("synthetic-B");
      if (end === "unmount") subject.unmount(); else { subject.render(changed); subject.render(changed); await tick(); subject.render(changed); }
      assert(signal.aborted); const before = JSON.stringify(subject.states());
      held.resolve(response(true, { data: urlSafeMarker(item.endpoint) })); await tick();
      assert.equal(JSON.stringify(subject.states()), before, "an aborted old request cannot replace current state or clear current flags");
      assert.equal(subject.postUnmountWrites(), 0); if (end !== "unmount") subject.unmount();
    }
  }
  await financialCases(); await financialDialogCases(); await documentUploadCases(); await mutationPrivacyCases();
  console.log("PASS offline PE actual callbacks: read errors/no loops/retry/stale fencing; financial saved refresh, save-callback separation, duplicate lock and uncertain-save protection; no DB/browser/DART/AI/provider calls");
}
function urlSafeMarker(endpoint: string) { return endpoint === "/documents" ? { documents: [{ id: "synthetic-old-document" }], evidence: [], findings: [] } : [{ id: "synthetic-old-request" }]; }
main().catch(error => { const scalar=(value:unknown)=>typeof value === "number" || typeof value === "boolean" ? value : "WITHHELD"; console.error(JSON.stringify({result:"PE_CLIENT_OFFLINE_FAILED",stage,diagnostic:error instanceof assert.AssertionError ? {actual:scalar(error.actual),expected:scalar(error.expected)}:"DETAILS_WITHHELD"})); process.exitCode=1; });
