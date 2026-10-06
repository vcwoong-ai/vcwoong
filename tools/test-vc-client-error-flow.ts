/** Actual upload component callbacks with synthetic hooks, files and responses; no browser/provider. */
/* eslint-disable @typescript-eslint/no-explicit-any -- React VM and dropzone callback ports are synthetic runtime test boundaries. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { uploadRejectionMessage, withCleanup } from "../src/lib/client-flow-status";

const source = fs.readFileSync("src/components/upload/file-uploader.tsx", "utf8");
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const response = (ok: boolean, data: any, status = ok ? 200 : 500) => ({ ok, status, json: async () => data });
const tick = async () => { for (let step = 0; step < 20; step++) await Promise.resolve(); };
function harness(fetcher: any, blobUpload: any) {
  const states: any[] = [], effects: Array<() => any> = [], refs: any[] = [];
  let index = 0, refIndex = 0, zone: any, tree: any;
  const busy: boolean[] = [], complete: string[] = [];
  const jsx = (type: any, props: any) => ({ type, props });
  class SyntheticFormData {
    entries: Record<string, any> = {};
    append(key: string, value: any) { this.entries[key] = value; }
  }
  const exports: any = {};
  const react = {
    useState(initial: any) {
      const slot = index++;
      if (!(slot in states)) states[slot] = initial;
      return [states[slot], (next: any) => { states[slot] = typeof next === "function" ? next(states[slot]) : next; }];
    }, useCallback: (fn: any) => fn,
    useRef(initial: any) { const slot = refIndex++; return refs[slot] ?? (refs[slot] = { current: initial }); },
    useEffect(fn: () => any) { effects.push(fn); },
  };
  vm.runInNewContext(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, { exports, FormData: SyntheticFormData, fetch: fetcher,
    setInterval: () => 1, clearInterval: () => {}, require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "react-dropzone") return { useDropzone: (options: any) => {
        zone = options; return { getRootProps: () => ({}), getInputProps: () => ({}), isDragActive: false };
      } };
      if (name === "@vercel/blob/client") return { upload: blobUpload };
      if (name === "@/lib/client-flow-status") return { uploadRejectionMessage, withCleanup };
      if (name === "@/lib/utils") return { cn: (...args: any[]) => args.filter(value => typeof value === "string").join(" ") };
      if (["lucide-react", "@/components/ui/button", "@/components/ui/progress"].includes(name))
        return new Proxy({}, { get: (_target, key) => String(key) });
      throw new Error("Unexpected VM dependency");
    } });
  const render = (dealId = "synthetic-deal-A") => {
    index = 0; refIndex = 0; effects.length = 0;
    tree = exports.FileUploader({ dealId, onUploadComplete: (id: string) => complete.push(id),
      onUploadingChange: (value: boolean) => busy.push(value) });
    for (const effect of effects) effect();
    return tree;
  };
  return { render, drop: (files: any[]) => zone.onDrop(files), reject: (files: any[]) => zone.onDropRejected(files),
    states, busy, complete };
}
function nodes(tree: any): any[] {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...nodes(tree.props?.children)];
}
/** Execute the real component with ordered hook slots and effect dependency cleanup. */
function clientHarness(file: string, exportName: string, fetcher: any, exposeCompare = false) {
  const slots: any[] = []; let index = 0, mounted = true, writesAfterUnmount = 0, search = "ids=synthetic-A";
  const queued: Array<() => void> = [], toasts: any[] = []; let tree: any, refreshes = 0;
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
  vm.runInNewContext(compiled + (exposeCompare ? "\nexports.__CompareContent = CompareContent;" : ""), { exports, Date, AbortController, DOMException, URLSearchParams, fetch: fetcher,
    setTimeout: (fn: () => void) => { queueMicrotask(fn); return 1; }, clearTimeout() {}, console: { error() {}, warn() {}, log() {} }, require(name: string) {
      if (name === "react") return react; if (name === "react/jsx-runtime") return { jsx, jsxs: jsx };
      if (name === "next/navigation") return { useRouter: () => ({ refresh: () => refreshes++, push() {} }), useSearchParams: () => new URLSearchParams(search) };
      if (name === "@/hooks/use-toast") return { useToast: () => ({ error: (...args: any[]) => toasts.push(args), success() {} }) };
      if (name === "@/hooks/use-confirm") return { useConfirm: () => async () => true };
      if (name === "@/lib/utils") return { cn: (...values: any[]) => values.filter(value => typeof value === "string").join(" ") };
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
    postUnmountWrites: () => writesAfterUnmount, refreshes: () => refreshes, toasts,
  };
}
function text(tree: any): string { if (Array.isArray(tree)) return tree.map(text).join(" "); if (tree === null || tree === undefined || typeof tree === "boolean") return ""; if (typeof tree !== "object") return String(tree); return text(tree.props?.children); }
function click(tree: any, label: string) { const button = nodes(tree).find(node => node.props?.onClick && text(node).trim() === label); assert(button, "synthetic UI action must exist"); return button.props.onClick(); }
const dealFixture = (id: string) => ({ id, userId: "synthetic-owner", teamId: null, name: id, companyName: id, sector: "GENERAL", stage: "REVIEW", investRound: null, investAmount: null, valuation: null, description: null, documents: [{ id: "synthetic-doc", name: "synthetic.txt", parsedText: "합성 자료", metadata: null, size: 1, mimeType: "text/plain", createdAt: "2026-06-01" }], reports: [] });
let stage = "upload regression";
async function pollingCases() {
  const file = "src/app/deals/[id]/deal-detail-client.tsx", props = { deal: dealFixture("synthetic-A"), currentUserId: "synthetic-owner", userTeamId: null };
  for (const failure of [401, 403, 500, "network", "invalid", "generation-error"] as const) {
    stage = `detail polling ${failure}`; let posts = 0, polls = 0, retry = false;
    const subject = clientHarness(file, "DealDetailClient", async (url: string, options: any = {}) => {
      if (url === "/api/templates") return response(true, { data: [] });
      if (options.method === "POST") { posts++; return response(true, { data: { id: "synthetic-report-A" } }); }
      assert.equal(url, "/api/reports/synthetic-report-A/status"); assert(options.signal); assert.equal(options.cache, "no-store"); polls++;
      if (retry) return response(true, { data: { status: "completed", completed: 10, total: 10 } });
      if (failure === "network") throw new Error("SYNTHETIC_PRIVATE_DETAIL");
      if (failure === "invalid") return response(true, { data: { status: "completed", completed: "bad", total: 10 } });
      if (failure === "generation-error") return response(true, { data: { status: "error", completed: 1, total: 10 } });
      return response(false, { error: "SYNTHETIC_PRIVATE_DETAIL" }, failure);
    });
    subject.render(props); await tick(); const tree = subject.render(props);
    const actions = nodes(tree).filter(node => node.props?.onClick && text(node).trim() === "AI 보고서 생성"); assert(actions.length); await actions.at(-1)!.props.onClick();
    const failedTree = subject.render(props); assert(nodes(failedTree).some(node => node.props?.role === "alert")); assert(!text(failedTree).includes("SYNTHETIC_PRIVATE_DETAIL"));
    assert.equal(posts, 1); assert.equal(polls, [401, 403, "generation-error"].includes(failure as any) ? 1 : 5);
    retry = true; await click(failedTree, "진행 상태 다시 확인"); assert.equal(posts, 1, "status retry never creates a second report"); assert.equal(polls, [401, 403, "generation-error"].includes(failure as any) ? 2 : 6);
    assert(!nodes(subject.render(props)).some(node => node.props?.role === "alert")); subject.unmount();
  }
  stage = "detail polling late completion after abort";
  const held = deferred<any>(); let signal: AbortSignal | undefined;
  const subject = clientHarness(file, "DealDetailClient", async (url: string, options: any = {}) => { if (url === "/api/templates") return response(true, { data: [] }); if (options.method === "POST") return response(true, { data: { id: "synthetic-report-A" } }); signal = options.signal; return held.promise; });
  subject.render(props); await tick(); const actions = nodes(subject.render(props)).filter(node => node.props?.onClick && text(node).trim() === "AI 보고서 생성"); const pending = actions.at(-1)!.props.onClick(); await tick(); assert(signal);
  subject.unmount(); assert(signal.aborted); const refreshes = subject.refreshes(); held.resolve(response(true, { data: { status: "completed", completed: 10, total: 10 } })); await pending; await tick();
  assert.equal(subject.postUnmountWrites(), 0); assert.equal(subject.refreshes(), refreshes);
  for (const failure of ["http", "network", "missing-id"] as const) {
    stage = `detail creation ambiguous ${failure}`; let posts = 0, gets = 0;
    const ambiguous = clientHarness(file, "DealDetailClient", async (url: string, options: any = {}) => {
      if (url === "/api/templates") return response(true, { data: [] });
      if (options.method !== "POST") { gets++; throw new Error("Unexpected poll"); }
      posts++; if (failure === "network") throw new Error("SYNTHETIC_PRIVATE_DETAIL");
      return failure === "missing-id" ? response(true, { data: {} }) : response(false, { error: "SYNTHETIC_PRIVATE_DETAIL" }, 503);
    });
    ambiguous.render(props); await tick(); const buttons = nodes(ambiguous.render(props)).filter(node => node.props?.onClick && text(node).trim() === "AI 보고서 생성"); await buttons.at(-1)!.props.onClick(); await tick();
    const failed = ambiguous.render(props); assert(nodes(failed).some(node => node.props?.role === "alert")); assert(!text(failed).includes("SYNTHETIC_PRIVATE_DETAIL")); assert.equal(posts, 1); assert.equal(gets, 0); ambiguous.unmount();
  }
  stage = "detail changed deal ignores late report creation success";
  const creation = deferred<any>(); let createSignal: AbortSignal | undefined, polls = 0;
  const moved = clientHarness(file, "DealDetailClient", async (url: string, options: any = {}) => { if (url === "/api/templates") return response(true, { data: [] }); if (options.method === "POST") { createSignal = options.signal; return creation.promise; } polls++; return response(true, { data: { status: "completed", completed: 10, total: 10 } }); });
  moved.render(props); await tick(); const buttons = nodes(moved.render(props)).filter(node => node.props?.onClick && text(node).trim() === "AI 보고서 생성"); const oldCreate = buttons.at(-1)!.props.onClick(); await tick();
  moved.render({ ...props, deal: dealFixture("synthetic-B") }); assert(createSignal?.aborted); creation.resolve(response(true, { data: { id: "synthetic-old-report" } })); await oldCreate; await tick();
  assert.equal(polls, 0); assert.equal(moved.refreshes(), 0); assert.equal(moved.toasts.length, 0); moved.unmount();
}
async function comparisonCases() {
  const file = "src/app/deals/compare/deals-compare-client.tsx";
  for (const status of [401, 403, 500, "network", "invalid"] as const) {
    stage = `comparison ${status}`; let calls = 0;
    const subject = clientHarness(file, "", async (_url: string, options: any) => { assert(options.signal); calls++; if (calls > 1) return response(true, { data: [] }); if (status === "network") throw new Error("SYNTHETIC_PRIVATE_DETAIL"); if (status === "invalid") return response(true, { data: [{ id: "synthetic-invalid", companyName: "synthetic", score: { overall: "bad" } }] }); return response(false, { error: "SYNTHETIC_PRIVATE_DETAIL" }, status); }, true);
    subject.render(); await tick(); const failed = subject.render(); assert(nodes(failed).some(node => node.props?.role === "alert")); assert(!text(failed).includes("SYNTHETIC_PRIVATE_DETAIL")); assert(!text(failed).includes("비교할 딜을 선택하지 않았습니다"));
    click(failed, "비교 다시 조회"); subject.render(); await tick(); const restored = subject.render(); assert.equal(calls, 2); assert(!nodes(restored).some(node => node.props?.role === "alert")); assert(text(restored).includes("비교할 딜을 선택하지 않았습니다")); subject.unmount();
  }
  stage = "comparison changed query ignores a late success after abort";
  const old = deferred<any>(); let oldSignal: AbortSignal | undefined;
  const newer = [{ id: "synthetic-B", companyName: "SYNTHETIC_NEW_ROW", score: null }];
  const race = clientHarness(file, "", async (url: string, options: any) => { if (url.includes("synthetic-A")) { oldSignal = options.signal; return old.promise; } return response(true, { data: newer }); }, true);
  race.render(); race.search("ids=synthetic-B"); race.render(); await tick(); assert(oldSignal?.aborted); assert.deepEqual(race.states()[0], newer);
  old.resolve(response(true, { data: [{ id: "synthetic-A", companyName: "SYNTHETIC_OLD_ROW", score: null }] })); await tick(); assert.deepEqual(race.states()[0], newer); race.unmount();
}
async function readPanelCases() {
  const cases = [
    { file: "src/components/deals/deal-score-radar.tsx", name: "DealScoreRadar", key: "dealId", retry: "점수 다시 조회", mutate: "점수 계산하기", success: { overall: 50, marketSize: 50, team: 50, product: 50, businessModel: 50, financials: 50, moat: 50, rationale: {}, modelUsed: "synthetic-only", computedAt: "2026-06-01" }, callback: "onComputed" },
    { file: "src/components/reports/ic-questions-panel.tsx", name: "IcQuestionsPanel", key: "reportId", retry: "IC 질문 다시 조회", mutate: "IC 질문 생성", success: { questions: [], top5: [], modelUsed: "synthetic-only" }, callback: "onGenerated" },
  ];
  for (const item of cases) {
    const props = { [item.key]: "synthetic-A", canEdit: true };
    if (item.name === "DealScoreRadar") {
      stage = "score numeric values with malformed optional evidence";
      const malformed = clientHarness(item.file, item.name, async () => response(true, { data: { ...item.success, evidenceAssessment: {} } }));
      malformed.render(props); await tick();
      assert(nodes(malformed.render(props)).some(node => node.props?.role === "alert"), "malformed optional evidence becomes a read error without a render crash"); malformed.unmount();
    }
    for (const failure of [401, 403, 500, "network", "invalid"] as const) {
      stage = `${item.name} GET ${failure}`; let calls = 0;
      const subject = clientHarness(item.file, item.name, async (_url: string, options: any) => { assert(options.signal); calls++; if (calls > 1) return response(true, { data: null }); if (failure === "network") throw new Error("SYNTHETIC_PRIVATE_DETAIL"); if (failure === "invalid") return response(true, { data: { invalid: true } }); return response(false, { error: "SYNTHETIC_PRIVATE_DETAIL" }, failure); });
      subject.render(props); await tick(); const failed = subject.render(props); assert(nodes(failed).some(node => node.props?.role === "alert")); assert(!text(failed).includes("SYNTHETIC_PRIVATE_DETAIL"));
      click(failed, item.retry); await tick(); const restored = subject.render(props); assert.equal(calls, 2); assert(!nodes(restored).some(node => node.props?.role === "alert")); assert.equal(subject.states()[0], null); subject.unmount();
    }
    stage = `${item.name} changed resource ignores late GET`;
    const old = deferred<any>(); let oldSignal: AbortSignal | undefined;
    const race = clientHarness(item.file, item.name, async (url: string, options: any) => { if (url.includes("synthetic-A")) { oldSignal = options.signal; return old.promise; } return response(true, { data: item.success }); });
    race.render(props); race.render({ ...props, [item.key]: "synthetic-B" }); await tick(); assert(oldSignal?.aborted); assert.deepEqual(race.states()[0], item.success);
    old.resolve(response(true, { data: null })); await tick(); assert.deepEqual(race.states()[0], item.success); race.unmount();
    stage = `${item.name} changed resource ignores late POST and callback`;
    const mutation = deferred<any>(), newerMutation = deferred<any>(); let callbacks = 0, mutations = 0;
    const pendingMutation = clientHarness(item.file, item.name, async (_url: string, options: any = {}) => options.method === "POST" ? (++mutations === 1 ? mutation.promise : newerMutation.promise) : response(true, { data: null }));
    const withCallback = { ...props, [item.callback]: () => callbacks++ }; pendingMutation.render(withCallback); await tick();
    const pending = click(pendingMutation.render(withCallback), item.mutate); await tick(); pendingMutation.render({ ...withCallback, [item.key]: "synthetic-B" }); await tick();
    const newer = click(pendingMutation.render({ ...withCallback, [item.key]: "synthetic-B" }), item.mutate); await tick();
    mutation.resolve(response(true, { data: item.success })); await pending; await tick(); assert.equal(callbacks, 0); assert.equal(pendingMutation.states()[0], null);
    assert(nodes(pendingMutation.render({ ...withCallback, [item.key]: "synthetic-B" })).some(node => node.props?.onClick && node.props.disabled === true), "old finally cannot clear the new resource's pending mutation");
    newerMutation.resolve(response(true, { data: item.success })); await newer; await tick(); assert.equal(callbacks, 1); pendingMutation.unmount();
  }
}
async function auxiliaryCases() {
  const ready = { id: "synthetic-template", name: "SYNTHETIC_READY_TEMPLATE", status: "READY", fileType: "DOCX" };
  for (const wizard of [false, true]) {
    const file = wizard ? "src/components/reports/report-wizard.tsx" : "src/app/deals/[id]/deal-detail-client.tsx";
    const name = wizard ? "ReportWizard" : "DealDetailClient", prefix = wizard ? "wizard" : "detail";
    const props = { deal: dealFixture("synthetic-A"), open: true, onClose() {}, currentUserId: "synthetic-owner", userTeamId: null };
    const showTemplates = (subject: any, current = props) => { let tree = subject.render(current); if (wizard && nodes(tree).some(node => node.props?.onClick && text(node).trim() === "다음")) { click(tree, "다음"); tree = subject.render(current); } return tree; };
    for (const failure of [401, 403, 500, "network", "invalid"] as const) {
      stage = `${prefix} template GET failure ${failure}`; let gets = 0, posts = 0;
      const subject = clientHarness(file, name, async (url: string, options: any = {}) => {
        if (options.method === "POST") { posts++; throw new Error("Unexpected POST"); }
        assert.equal(url, "/api/templates"); assert.equal(options.cache, "no-store"); assert(options.signal); gets++;
        if (gets > 1) return response(true, { data: [ready, { ...ready, id: "synthetic-pending", name: "SYNTHETIC_PENDING_TEMPLATE", status: "ANALYZING" }] });
        if (failure === "network") throw new Error("SYNTHETIC_PRIVATE_DETAIL");
        return failure === "invalid" ? response(true, { data: [{ id: "incomplete" }] }) : response(false, { error: "SYNTHETIC_PRIVATE_DETAIL" }, failure);
      });
      subject.render(props); await tick(); const failed = showTemplates(subject);
      assert(nodes(failed).some(node => node.props?.["data-testid"] === `${prefix}-template-error` && node.props.role === "alert"));
      assert(!text(failed).includes("SYNTHETIC_PRIVATE_DETAIL")); assert(!text(failed).includes("등록된 양식 없음"));
      await click(failed, "양식 목록 다시 조회"); await tick(); const restored = subject.render(props);
      assert.equal(gets, 2); assert.equal(posts, 0); assert(!nodes(restored).some(node => node.props?.["data-testid"] === `${prefix}-template-error`));
      assert(text(restored).includes(ready.name)); assert(!text(restored).includes("SYNTHETIC_PENDING_TEMPLATE")); subject.unmount();
    }
    for (const failure of [500, "network", "invalid"] as const) {
      stage = `${prefix} sector failure ${failure}`; let posts = 0;
      const subject = clientHarness(file, name, async (_url: string, options: any = {}) => {
        if (options.method !== "POST") return response(true, { data: [] }); posts++; assert(options.signal);
        if (failure === "network") throw new Error("SYNTHETIC_PRIVATE_DETAIL");
        return failure === "invalid" ? response(true, { data: { sector: "INVALID" } }) : response(false, { error: "SYNTHETIC_PRIVATE_DETAIL" });
      });
      subject.render(props); await tick(); await click(subject.render(props), wizard ? "자동 감지" : "섹터 감지"); await tick();
      const failed = subject.render(props); assert(nodes(failed).some(node => node.props?.["data-testid"] === `${prefix}-sector-error` && node.props.role === "alert"));
      assert.equal(posts, 1); assert(!text(failed).includes("SYNTHETIC_PRIVATE_DETAIL")); subject.unmount();
    }
    for (const request of ["template", "sector"] as const) {
      stage = `${prefix} ${request} old response ignores changed resource`;
      const held = deferred<any>(); let oldSignal: AbortSignal | undefined, templateCalls = 0;
      const subject = clientHarness(file, name, async (_url: string, options: any = {}) => {
        if (options.method === "POST") { oldSignal = options.signal; return held.promise; }
        templateCalls++; if (request === "template" && templateCalls === 1) { oldSignal = options.signal; return held.promise; }
        return response(true, { data: [ready] });
      });
      subject.render(props); await tick(); let pending: any;
      if (request === "sector") { pending = click(subject.render(props), wizard ? "자동 감지" : "섹터 감지"); await tick(); }
      const changed = { ...props, deal: dealFixture("synthetic-B") }; subject.render(changed); await tick(); assert(oldSignal?.aborted);
      held.resolve(response(true, { data: request === "template" ? [{ ...ready, name: "SYNTHETIC_OLD_TEMPLATE" }] : { sector: "BIO", label: "SYNTHETIC_OLD_SECTOR", reason: "SYNTHETIC_OLD_SECTOR" } }));
      await pending; await tick(); const tree = showTemplates(subject, changed);
      assert(!text(tree).includes("SYNTHETIC_OLD_TEMPLATE")); assert(!text(tree).includes("SYNTHETIC_OLD_SECTOR")); subject.unmount();
    }
    stage = `${prefix} custom template selection survives reload failure but cannot generate`;
    let templateLoads = 0, generationPosts = 0;
    const custom = clientHarness(file, name, async (_url: string, options: any = {}) => {
      if (options.method === "POST") { generationPosts++; throw new Error("Unexpected custom generation"); }
      return ++templateLoads === 1 ? response(true, { data: [ready] }) : response(false, { error: "SYNTHETIC_PRIVATE_DETAIL" });
    });
    custom.render(props); await tick(); const initial = showTemplates(custom);
    if (wizard) { const choice = nodes(initial).find(node => node.type === "button" && node.props.onClick && text(node).includes(ready.name)); assert(choice); choice.props.onClick(); }
    else { const choice = nodes(initial).find(node => node.type === "Select" && node.props.onValueChange && node.props.value !== undefined); assert(choice); choice.props.onValueChange(ready.id); }
    const changed = { ...props, deal: dealFixture("synthetic-B") }; custom.render(changed); await tick(); const failedCustom = showTemplates(custom, changed);
    assert(custom.states().includes(ready.id), "previous custom selection is preserved for user recovery");
    if (wizard) { const action = nodes(failedCustom).find(node => node.props?.onClick && text(node).trim() === "생성 시작"); assert(action); assert.equal(action.props.disabled, true); await action.props.onClick(); }
    else { const actions = nodes(failedCustom).filter(node => node.props?.onClick && text(node).trim() === "AI 보고서 생성"); assert(actions.length); await actions.at(-1)!.props.onClick(); }
    assert.equal(generationPosts, 0); custom.unmount();
    stage = `${prefix} auxiliary late network failure after unmount`;
    const held = deferred<any>(); let signal: AbortSignal | undefined;
    const unmounted = clientHarness(file, name, async (_url: string, options: any) => { signal = options.signal; return held.promise; });
    unmounted.render(props); unmounted.unmount(); assert(signal?.aborted); held.reject(new Error("SYNTHETIC_PRIVATE_DETAIL")); await tick(); assert.equal(unmounted.postUnmountWrites(), 0);
  }
}
async function wizardGenerationCases() {
  const file = "src/components/reports/report-wizard.tsx", props = { deal: dealFixture("synthetic-A"), open: true, onClose() {} };
  const prepare = async (subject: any) => { subject.render(props); await tick(); click(subject.render(props), "다음"); return subject.render(props); };
  for (const failure of ["http-private", "http-html", "http-401", "http-403", "http-409", "http-429", "network", "malformed", "invalid-id", "non-json"] as const) {
    stage = `wizard generation safe failure ${failure}`; let creates = 0, downstream = 0;
    const subject = clientHarness(file, "ReportWizard", async (url: string, options: any = {}) => {
      if (url === "/api/templates") return response(true, { data: [] });
      if (url.endsWith("/reports") && options.method === "POST") {
        creates++;
        if (failure === "network") throw new Error("SYNTHETIC_PRIVATE_DETAIL");
        if (failure === "malformed") return response(true, { data: {} });
        if (failure === "invalid-id") return response(true, { data: { id: "invalid/path" } });
        if (failure === "non-json") return { ok: true, status: 200, json: async () => { throw new Error("SYNTHETIC_PRIVATE_DETAIL"); } };
        const status = /^http-\d+$/.test(failure) ? Number(failure.slice(5)) : 503;
        return response(false, { error: failure === "http-html" ? "<html>SYNTHETIC_PRIVATE_DETAIL</html>" : "SYNTHETIC_PRIVATE_DETAIL" }, status);
      }
      downstream++; return response(false, {});
    });
    await click(await prepare(subject), "생성 시작"); await tick(); const tree = subject.render(props);
    assert.equal(creates, 1); assert.equal(downstream, 0, "ambiguous creation cannot poll or resume an invalid report");
    assert(!text(tree).includes("SYNTHETIC_PRIVATE_DETAIL")); assert(!text(tree).includes("<html>"));
    assert(nodes(tree).some(node => node.props?.role === "alert"), "creation failure has a visible safe guide"); subject.unmount();
  }
  stage = "wizard same event generation request is locked before rerender";
  const held = deferred<any>(); let creates = 0;
  const duplicate = clientHarness(file, "ReportWizard", async (url: string) => { if (url === "/api/templates") return response(true, { data: [] }); creates++; return held.promise; });
  const tree = await prepare(duplicate), first = click(tree, "생성 시작"), second = click(tree, "생성 시작"); await tick();
  assert.equal(creates, 1); duplicate.unmount(); held.resolve(response(true, { data: { id: "00000000-0000-4000-8000-000000000001" } })); await Promise.all([first, second]); assert.equal(duplicate.postUnmountWrites(), 0);
  for (const payload of [null, {}, ...[-1, 11, 0.5, NaN].map(completed => ({ status: "error", reportStatus: "PENDING", total: 10, completed, currentSection: "" })), { status: "error", reportStatus: "PENDING", total: 10, completed: 0, currentSection: 99 }, { status: "error", reportStatus: "UNKNOWN_PRIVATE_STATUS", total: 10, completed: 0, currentSection: "" }, { status: "completed", total: 10, completed: "10", currentSection: "" }, { status: "completed", total: 10, completed: 9, currentSection: "", reportStatus: "FINAL" }, ...["PENDING", "GENERATING"].map(reportStatus => ({ status: "completed", total: 10, completed: 10, currentSection: "", reportStatus }))]) {
    stage = "wizard invalid status cannot trigger automatic resume"; let polls = 0, resumes = 0;
    const subject = clientHarness(file, "ReportWizard", async (url: string, options: any = {}) => {
      if (url === "/api/templates") return response(true, { data: [] });
      if (url.endsWith("/reports") && options.method === "POST") return response(true, { data: { id: "00000000-0000-4000-8000-000000000001" } });
      if (url.endsWith("/run")) { resumes++; return response(false, {}); }
      assert.equal(url, "/api/reports/00000000-0000-4000-8000-000000000001/status"); polls++; return polls === 1 ? response(true, { data: payload }) : response(false, {});
    });
    await click(await prepare(subject), "생성 시작"); assert.equal(resumes, 0); assert(polls <= 6);
    const failed = subject.render(props); assert(nodes(failed).some(node => node.props?.role === "alert"));
    assert(!text(failed).includes("보고서 생성 완료!")); subject.unmount();
  }
  for (const resumeStatus of [200, 409]) {
  stage = `wizard valid pending checkpoint preserves automatic resume policy ${resumeStatus}`;
  let polls = 0, resumes = 0;
  const resume = clientHarness(file, "ReportWizard", async (url: string, options: any = {}) => {
    if (url === "/api/templates") return response(true, { data: [] });
    if (url.endsWith("/reports") && options.method === "POST") return response(true, { data: { id: "00000000-0000-4000-8000-000000000001" } });
    if (url.endsWith("/run")) { resumes++; assert.equal(JSON.parse(options.body).trigger, "auto"); return response(resumeStatus === 200, {}, resumeStatus); }
    assert.equal(url, "/api/reports/00000000-0000-4000-8000-000000000001/status"); return response(true, { data: ++polls === 1 ? { status: "error", reportStatus: "PENDING", total: 10, completed: 0, currentSection: "" } : { status: "completed", reportStatus: "FINAL", total: 10, completed: 10, currentSection: "" } });
  });
  await click(await prepare(resume), "생성 시작"); assert.equal(resumes, 1); assert.equal(polls, 2); const completed = resume.render(props); assert(!nodes(completed).some(node => node.props?.role === "alert")); assert(text(completed).includes("보고서 생성 완료!")); resume.unmount();
  }
  for (const denied of [401, 403, 404]) {
    stage = `wizard status permission failure ${denied} does not resume`; let polls = 0, resumes = 0;
    const subject = clientHarness(file, "ReportWizard", async (url: string, options: any = {}) => {
      if (url === "/api/templates") return response(true, { data: [] });
      if (url.endsWith("/reports") && options.method === "POST") return response(true, { data: { id: "00000000-0000-4000-8000-000000000001" } });
      if (url.endsWith("/run")) { resumes++; return response(true, {}); }
      polls++; return response(false, { error: "SYNTHETIC_PRIVATE_DETAIL", data: { status: "error", reportStatus: "PENDING", total: 10, completed: 0, currentSection: "" } }, denied);
    });
    await click(await prepare(subject), "생성 시작"); assert.equal(polls, 1); assert.equal(resumes, 0);
    assert(!text(subject.render(props)).includes("SYNTHETIC_PRIVATE_DETAIL")); subject.unmount();
  }
  stage = "wizard repeated valid checkpoints stop at existing twenty resume limit"; let resumes = 0;
  const bounded = clientHarness(file, "ReportWizard", async (url: string, options: any = {}) => {
    if (url === "/api/templates") return response(true, { data: [] });
    if (url.endsWith("/reports") && options.method === "POST") return response(true, { data: { id: "00000000-0000-4000-8000-000000000001" } });
    if (url.endsWith("/run")) { resumes++; return response(true, {}); }
    return response(true, { data: { status: "error", reportStatus: "PENDING", total: 10, completed: 0, currentSection: "" } });
  });
  await click(await prepare(bounded), "생성 시작"); assert.equal(resumes, 20); assert(nodes(bounded.render(props)).some(node => node.props?.role === "alert")); bounded.unmount();
}
async function wizardSessionCases() {
  const file = "src/components/reports/report-wizard.tsx";
  const props = { deal: dealFixture("synthetic-A"), open: true, onClose() {} };
  stage = "wizard old generation response after close and reopen";
  const held = deferred<any>(); let creations = 0, statusReads = 0, resumes = 0, callbacks = 0;
  const subject = clientHarness(file, "ReportWizard", async (url: string, options: any = {}) => {
    if (url === "/api/templates") return response(true, { data: [] });
    if (url.endsWith("/reports") && options.method === "POST") { creations++; return held.promise; }
    if (url.endsWith("/status")) statusReads++;
    if (url.endsWith("/run")) resumes++;
    throw new Error("Unexpected stale generation request");
  });
  const current = { ...props, onClose: () => callbacks++ };
  subject.render(current); await tick(); click(subject.render(current), "다음");
  const pending = click(subject.render(current), "생성 시작"); await tick(); assert.equal(creations, 1);
  subject.render({ ...current, open: false }); subject.render(current); await tick();
  const before = JSON.stringify(subject.states());
  held.resolve(response(true, { data: { id: "00000000-0000-4000-8000-000000000002" } })); await pending; await tick();
  assert.equal(JSON.stringify(subject.states()), before, "old completion and finally must not update the reopened session");
  assert.equal(statusReads, 0); assert.equal(resumes, 0); assert.equal(callbacks, 0); assert.equal(subject.refreshes(), 0); subject.unmount();
  stage = "wizard readonly actual generation and sector callbacks request nothing";
  let forbidden = 0;
  const readonly = clientHarness(file, "ReportWizard", async (url: string) => {
    if (url === "/api/templates") return response(true, { data: [] }); forbidden++; throw new Error("Unexpected readonly mutation");
  });
  const readonlyProps = { ...props, canEdit: false }; readonly.render(readonlyProps); await tick();
  const first = readonly.render(readonlyProps), detect = nodes(first).find(node => node.props?.onClick && text(node).trim() === "자동 감지");
  assert(detect); assert.equal(detect.props.disabled, true); await detect.props.onClick();
  click(first, "다음"); const second = readonly.render(readonlyProps), generate = nodes(second).find(node => node.props?.onClick && text(node).trim() === "생성 시작");
  assert(generate); assert.equal(generate.props.disabled, true); await generate.props.onClick();
  assert.equal(forbidden, 0); readonly.unmount();
}
async function kanbanCases() {
  const file = "src/components/deals/deal-kanban.tsx";
  const deals = [{ ...dealFixture("synthetic-A"), stage: "SCREENING" }];
  const select = (tree: any) => nodes(tree).find(node => node.type === "select");
  const change = (tree: any, value: string) => { const node = select(tree); assert(node); node.props.onChange({ target: { value } }); };
  stage = "kanban native stage selection pending and failure recovery";
  const first = deferred<void>(); let calls = 0;
  const props = { deals, onStageChange: async (id: string, next: string) => { assert.equal(id, "synthetic-A"); assert.equal(next, "DEEP_DIVE"); calls++; if (calls === 1) return first.promise; } };
  const subject = clientHarness(file, "DealKanban", async () => { throw new Error("Unexpected fetch"); });
  subject.render(props); let tree = subject.render(props);
  assert.equal(select(tree).props["aria-label"], "synthetic-A 검토 단계");
  assert.equal(nodes(select(tree)).filter(node => node.type === "option").length, 6);
  change(tree, "DEEP_DIVE"); change(tree, "DEEP_DIVE"); await tick(); tree = subject.render(props);
  assert.equal(calls, 1); assert.equal(select(tree).props.value, "SCREENING"); assert.equal(select(tree).props.disabled, true);
  first.reject(new Error("SYNTHETIC_PRIVATE_DETAIL")); await tick(); tree = subject.render(props);
  assert(nodes(tree).some(node => node.props?.role === "alert")); assert(!text(tree).includes("SYNTHETIC_PRIVATE_DETAIL"));
  assert.equal(select(tree).props.value, "SCREENING"); assert.equal(select(tree).props.disabled, false);
  change(tree, "DEEP_DIVE"); await tick(); tree = subject.render(props); assert.equal(calls, 2); assert.equal(select(tree).props.value, "DEEP_DIVE");
  assert(!nodes(tree).some(node => node.props?.role === "alert")); subject.unmount();
  stage = "kanban readonly and invalid stage block mutation";
  let forbidden = 0;
  const readonly = clientHarness(file, "DealKanban", async () => { throw new Error("Unexpected fetch"); });
  const readonlyProps = { deals, canEditDeal: () => false, onStageChange: async () => { forbidden++; } };
  readonly.render(readonlyProps); const readonlyTree = readonly.render(readonlyProps); assert.equal(select(readonlyTree), undefined);
  assert(nodes(readonlyTree).some(node => node.props?.draggable === false)); assert.equal(forbidden, 0); readonly.unmount();
  const invalid = clientHarness(file, "DealKanban", async () => { throw new Error("Unexpected fetch"); });
  const invalidProps = { deals, onStageChange: async () => { forbidden++; } };
  invalid.render(invalidProps); change(invalid.render(invalidProps), "INVALID_SYNTHETIC_STAGE"); await tick(); assert.equal(forbidden, 0); invalid.unmount();
  for (const mode of ["props-change", "unmount"] as const) {
    stage = `kanban late saved stage ${mode}`; const held = deferred<void>();
    const race = clientHarness(file, "DealKanban", async () => { throw new Error("Unexpected fetch"); });
    const raceProps = { deals, onStageChange: () => held.promise }; race.render(raceProps); change(race.render(raceProps), "DEEP_DIVE");
    const newProps = { ...raceProps, deals: [{ ...deals[0], stage: "IC_PREP" }] };
    if (mode === "unmount") race.unmount(); else { race.render(newProps); race.render(newProps); }
    held.resolve(); await tick();
    if (mode === "unmount") assert.equal(race.postUnmountWrites(), 0);
    else { assert.equal(select(race.render(newProps)).props.value, "IC_PREP"); race.unmount(); }
  }
}
async function main() {
  const prepare = deferred<any>(), calls: any[] = [];
  const direct = harness(async (_url: string, options: any) => {
    calls.push(JSON.parse(options.body));
    return calls.length === 1 ? prepare.promise : response(true, { data: { id: "synthetic-document-A" } });
  }, async (_path: string, _file: any, options: any) => {
    calls.push(JSON.parse(options.clientPayload)); return { url: "synthetic-private-location" };
  });
  direct.render();
  direct.drop([{ name: "synthetic-large.pdf", type: "application/pdf", size: 5 * 1024 * 1024 }]);
  direct.render(); assert(direct.busy.includes(true));
  direct.render("synthetic-deal-B");
  prepare.resolve(response(true, { pathname: "synthetic-path", binding: "synthetic-binding" }));
  await tick(); direct.render("synthetic-deal-B");
  assert.equal(calls.length, 3);
  for (const call of calls) assert.equal(call.dealId, "synthetic-deal-A", "all direct-upload stages bind the initial deal");
  assert.equal(direct.states[0][0].status, "done"); assert.equal(direct.busy.at(-1), false);

  const first = deferred<any>(), second = deferred<any>(), multipart: any[] = [];
  const small = harness(async (_url: string, options: any) => {
    multipart.push(options.body.entries); return multipart.length === 1 ? first.promise : second.promise;
  }, async () => { throw new Error("Unexpected direct upload"); });
  small.render(); small.drop([
    { name: "synthetic-first.txt", type: "text/plain", size: 10 },
    { name: "synthetic-second.txt", type: "text/plain", size: 10 },
  ]);
  small.render(); assert.equal(small.busy.at(-1), true);
  small.render("synthetic-deal-B");
  for (const part of multipart) assert.equal(part.dealId, "synthetic-deal-A");
  first.resolve(response(true, { data: { id: "synthetic-first-document" } })); await tick(); small.render();
  assert.equal(small.states[0].length, 2); assert.equal(small.states[0][0].status, "done");
  assert.equal(small.states[0][1].status, "uploading"); assert.equal(small.busy.at(-1), true);
  second.resolve(response(false, { error: "합성 업로드 실패" })); await tick();
  const failedTree = small.render(); assert.equal(small.states[0][1].status, "error");
  assert.equal(small.busy.at(-1), false); assert.equal(small.complete.length, 1);
  assert(nodes(failedTree).some(node => node.props?.role === "alert" && node.props.children === "합성 업로드 실패"));
  small.reject([{ file: { name: "synthetic.exe" }, errors: [{ code: "file-invalid-type" }] }]);
  assert(nodes(small.render()).some(node => node.props?.role === "alert" && String(node.props.children).includes("지원하지 않는 파일 형식")));

  const detail = fs.readFileSync("src/app/deals/[id]/deal-detail-client.tsx", "utf8");
  assert(!/setUploadKey\s*\(/.test(detail), "first successful file must not reset other pending uploads");
  const uploadPage = fs.readFileSync("src/app/upload/upload-page-client.tsx", "utf8");
  assert(/key=\{selectedDealId\}/.test(uploadPage), "distinct deal upload lists are isolated");
  assert(/disabled=\{uploading\}/.test(uploadPage), "selection cannot change while uploading");
  await pollingCases(); await comparisonCases(); await readPanelCases(); await auxiliaryCases(); await wizardSessionCases(); await wizardGenerationCases(); await kanbanCases();
  console.log("PASS offline VC client callbacks: upload; status polling; comparison; score/IC stale GET-POST; detail/wizard template/sector; wizard safe generation errors, duplicate lock, malformed status and bounded resume; kanban selection and failure recovery; no DB/browser/provider calls");
}
main().catch(error => { const scalar = (value: unknown) => typeof value === "number" || typeof value === "boolean" ? value : "WITHHELD"; console.error(JSON.stringify({ result: "VC_CLIENT_OFFLINE_FAILED", stage, diagnostic: error instanceof assert.AssertionError ? { actual: scalar(error.actual), expected: scalar(error.expected) } : "DETAILS_WITHHELD" })); process.exitCode = 1; });
