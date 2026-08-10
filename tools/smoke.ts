/**
 * 배포된 환경에 실제로 요청을 보내 핵심 경로가 살아 있는지 확인한다.
 *
 * 이 스크립트가 있는 이유:
 *   PDF 파싱과 PPTX 내보내기가 몇 주간 프로덕션에서만 조용히 깨져 있었는데,
 *   로컬 빌드·타입체크·오프라인 테스트는 전부 통과했었다. 네이티브 의존성
 *   번들 누락처럼 "배포된 환경에서만" 터지는 문제는 실제 배포본에 요청을
 *   보내봐야만 잡힌다.
 *
 * Usage:
 *   npm run smoke -- https://dealsync-git-xxx.vercel.app
 *   SMOKE_EMAIL=demo@axiom.kr SMOKE_PASSWORD=... npm run smoke -- <url>
 *
 * 기본 계정은 시드 데모 계정(demo@axiom.kr)이다.
 * 테스트로 만든 딜은 끝나고 지우므로 데이터가 남지 않는다.
 */
import { BRAND } from "../src/lib/brand";

const baseUrl = (process.argv[2] ?? process.env.SMOKE_URL ?? "").replace(/\/$/, "");
const email = process.env.SMOKE_EMAIL ?? BRAND.demoEmail;
const password = process.env.SMOKE_PASSWORD ?? BRAND.demoPassword;

if (!baseUrl) {
  console.error("사용법: npm run smoke -- <배포 URL>");
  process.exit(1);
}

// ── 쿠키를 들고 다니는 최소 fetch 래퍼 (NextAuth 세션 유지용) ──
const cookies = new Map<string, string>();

function cookieHeader(): string {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(res: Response) {
  // Node 18+ 는 getSetCookie() 로 복수 Set-Cookie 를 읽을 수 있다.
  const raw =
    typeof (res.headers as { getSetCookie?: () => string[] }).getSetCookie === "function"
      ? (res.headers as unknown as { getSetCookie: () => string[] }).getSetCookie()
      : [res.headers.get("set-cookie")].filter(Boolean) as string[];
  for (const line of raw) {
    const [pair] = line.split(";");
    const idx = pair.indexOf("=");
    if (idx > 0) cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
  }
}

async function req(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { ...(init.headers ?? {}), cookie: cookieHeader() },
    redirect: "manual",
  });
  storeCookies(res);
  return res;
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

/**
 * 응답 본문을 한 번만 읽어 JSON으로 파싱한다.
 * 템플릿 문자열 안에서 `await res.text()`를 쓰면 assert가 통과하는 경우에도
 * 본문이 먼저 소비돼 이후 res.json()이 실패한다.
 */
async function readJson<T>(res: Response, what: string): Promise<T> {
  const body = await res.text();
  assert(res.ok, `${what} 실패 (${res.status}): ${body.slice(0, 300)}`);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new Error(`${what} 응답이 JSON이 아닙니다: ${body.slice(0, 300)}`);
  }
}

/**
 * 텍스트 레이어가 있는 최소 PDF를 만든다 (파싱이 실제로 되는지 확인용).
 * 표준 Helvetica 폰트만 쓰므로 본문은 ASCII로 둔다 — 한글을 넣으면 폰트
 * 임베딩 없이는 깨져 나와 검증 문자열로 쓸 수 없다.
 */
function buildTestPdf(): Buffer {
  const text =
    "Axiom smoke test document. ARR 45 EOK. NRR 118 percent. Series A round.";
  const stream = `BT /F1 12 Tf 40 700 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 4 0 R >> >> /MediaBox [0 0 612 792] /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });

  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  return Buffer.from(pdf, "latin1");
}

async function login() {
  const csrfRes = await req("/api/auth/csrf");
  assert(csrfRes.ok, `CSRF 토큰 요청 실패 (${csrfRes.status})`);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

  const res = await req("/api/auth/callback/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ csrfToken, email, password, json: "true" }),
  });

  const sessionRes = await req("/api/auth/session");
  const session = (await sessionRes.json()) as { user?: { id?: string } };
  assert(
    Boolean(session.user?.id),
    `로그인 실패 (status=${res.status}) — 계정/비밀번호를 확인하세요: ${email}`
  );
  console.log(`✅ 로그인 (${email})`);
}

async function checkHealth() {
  const res = await req("/api/health");
  assert(res.ok, `헬스체크 실패 (${res.status})`);
  console.log("✅ 헬스체크");
}

async function createDeal(): Promise<string> {
  const res = await req("/api/deals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `스모크테스트 ${new Date().toISOString()}`,
      companyName: "스모크테스트",
      sector: "IT",
    }),
  });
  const { data } = await readJson<{ data: { id: string } }>(res, "딜 생성");
  console.log("✅ 딜 생성");
  return data.id;
}

/** 배포 환경에서만 터지던 PDF 파싱을 실제 업로드로 확인한다 */
async function uploadAndCheckParsing(dealId: string) {
  const pdf = buildTestPdf();
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(pdf)], { type: "application/pdf" }), "smoke.pdf");
  form.append("dealId", dealId);

  const res = await req("/api/upload", { method: "POST", body: form });
  const { data } = await readJson<{
    data: { id: string; parsedText: string | null };
  }>(res, "업로드");
  const chars = data.parsedText?.length ?? 0;

  assert(
    chars > 0,
    `PDF에서 텍스트가 한 글자도 추출되지 않았습니다. ` +
      `배포 번들에 pdf-parse 의존성이 빠졌을 수 있습니다 (로컬에서는 재현되지 않는 문제).`
  );
  assert(
    data.parsedText?.includes("Axiom") ?? false,
    `추출된 텍스트에 기대한 내용이 없습니다: ${data.parsedText?.slice(0, 80)}`
  );
  console.log(`✅ PDF 업로드 + 텍스트 추출 (${chars}자)`);
}

async function cleanup(dealId: string) {
  const res = await req(`/api/deals/${dealId}`, { method: "DELETE" });
  assert(res.ok, `딜 삭제 실패 (${res.status}) — 테스트 데이터가 남았습니다: ${dealId}`);
  console.log("✅ 테스트 데이터 정리");
}

async function main() {
  console.log(`\n=== Axiom 스모크 테스트 ===\n대상: ${baseUrl}\n`);

  await checkHealth();
  await login();

  const dealId = await createDeal();
  try {
    await uploadAndCheckParsing(dealId);
  } finally {
    await cleanup(dealId).catch((err) => console.error("⚠️ 정리 실패:", err.message));
  }

  console.log("\n✅ 스모크 테스트 통과\n");
}

main().catch((err) => {
  console.error(`\n❌ ${err instanceof Error ? err.message : err}\n`);
  process.exit(1);
});
