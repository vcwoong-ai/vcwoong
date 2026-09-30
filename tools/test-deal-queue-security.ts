/**
 * VC 딜 목록 배치 결정 요약(GET /api/deals/decision-summaries) 보안·적대적 검증 — 로컬 SQLite + 실행 중인 dev 서버 전용.
 *
 * 운영/원격 DB에는 실행하지 않는다(DATABASE_URL이 file: 이 아니면 즉시 중단). 임시 사용자 3명을 만들고 끝나면 지운다.
 *  · 소유자: demo 계정 (실제 시드 딜·보고서를 가진 계정)
 *  · 같은 팀 ANALYST: 팀 공유 딜을 읽을 수 있어야 함(읽기 전용 — 이 API엔 쓰기가 없다)
 *  · 외부인(팀 없음): 소유자의 딜 id를 알아도 아무것도 받으면 안 됨, 응답이 "없는 id"와 바이트 단위로 같아야 함
 *
 * Usage: DATABASE_URL='file:./dev.db' npx tsx tools/test-deal-queue-security.ts   (dev 서버: npm run dev:local)
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const prisma = new PrismaClient();
let pass = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
  pass++;
  console.log(`✅ ${msg}`);
}

async function login(email: string, password: string): Promise<string> {
  const csrfRes = await fetch(`${BASE}/api/auth/csrf`);
  const jar = new Map<string, string>();
  const collect = (res: Response) => {
    for (const c of res.headers.getSetCookie?.() ?? []) {
      const [pair] = c.split(";");
      const idx = pair.indexOf("=");
      jar.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
  };
  collect(csrfRes);
  const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };
  const cookieHeader = () => Array.from(jar).map(([k, v]) => `${k}=${v}`).join("; ");
  const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: cookieHeader() },
    body: new URLSearchParams({ csrfToken, email, password, json: "true" }).toString(),
  });
  collect(res);
  if (!Array.from(jar.keys()).some((k) => k.includes("session-token"))) throw new Error(`로그인 실패: ${email} (${res.status})`);
  return cookieHeader();
}

const get = (path: string, cookie?: string) => fetch(`${BASE}${path}`, { headers: cookie ? { Cookie: cookie } : {} });

async function main() {
  if (!(process.env.DATABASE_URL ?? "").startsWith("file:")) {
    console.error("중단: 로컬 SQLite가 아닌 DB에는 실행하지 않습니다.");
    process.exit(1);
  }
  console.log(`\n=== VC 대기열 배치 API 보안 검증 — 대상: ${BASE} ===\n`);

  const owner = await prisma.user.findUnique({ where: { email: "demo@dealmind.kr" }, select: { id: true, teamId: true } });
  if (!owner?.teamId) throw new Error("demo 계정/팀이 없습니다 — npm run db:setup:local 먼저");
  const ownerDeals = await prisma.deal.findMany({ where: { userId: owner.id }, select: { id: true, reports: { select: { id: true }, take: 1 } } });
  const withReport = ownerDeals.filter((d) => d.reports.length > 0).map((d) => d.id);
  const withoutReport = ownerDeals.filter((d) => d.reports.length === 0).map((d) => d.id);
  if (withReport.length === 0 || withoutReport.length === 0) throw new Error("보고서가 있는/없는 딜이 모두 필요합니다");

  const pw = "Queue1234!Test";
  const hash = await bcrypt.hash(pw, 4);
  const stamp = Date.now();
  const teammate = await prisma.user.create({ data: { email: `queue-teammate-${stamp}@example.com`, name: "팀원", passwordHash: hash, role: "ANALYST", teamId: owner.teamId } });
  // 팀에 공유되지 않은(teamId 없는) 소유자 전용 딜 + 보고서 — 같은 팀 사용자에게도 안 보여야 한다
  const privateDeal = await prisma.deal.create({
    data: {
      name: `임시 비공개 ${stamp}`, companyName: "임시 비공개(테스트)", sector: "GENERAL", userId: owner.id, teamId: null,
      reports: { create: { title: "임시 보고서", agentType: "GENERAL" as never, status: "DRAFT" } },
    },
    select: { id: true },
  });
  const outsider = await prisma.user.create({ data: { email: `queue-outsider-${stamp}@example.com`, name: "외부인", passwordHash: hash } });

  try {
    const idsParam = encodeURIComponent([...withReport, ...withoutReport, privateDeal.id].join(","));

    // 1) 인증
    const anon = await get(`/api/deals/decision-summaries?ids=${idsParam}`);
    assert(anon.status === 401, "비로그인은 401");

    // 2) 소유자
    const ownerCookie = await login("demo@dealmind.kr", "Demo1234!");
    const ownerRes = await get(`/api/deals/decision-summaries?ids=${idsParam}`, ownerCookie);
    const ownerJson = (await ownerRes.json()) as { data: Record<string, { reportId: string; nextAction: { label: string } }> };
    assert(ownerRes.status === 200, "소유자는 200");
    assert(withReport.every((id) => ownerJson.data[id]), "보고서가 있는 딜은 요약이 온다");
    assert(withoutReport.every((id) => !ownerJson.data[id]), "보고서가 없는 딜은 요약을 지어내지 않고 빠진다");
    assert(ownerJson.data[privateDeal.id] !== undefined, "소유자는 자기 비공개 딜의 요약을 받는다(비공개 검증의 전제)");

    // 3) 요약이 화면 API와 같은 결과인가 (단일 계산 경로)
    const anyId = withReport[0];
    const detail = await get(`/api/reports/${ownerJson.data[anyId].reportId}/decision`, ownerCookie);
    const detailJson = (await detail.json()) as { data: { decision: { contradictions: unknown[]; recommendation: string } } };
    const listed = ownerJson.data[anyId] as unknown as { contradictionCount: number; recommendation: string };
    assert(
      listed.contradictionCount === detailJson.data.decision.contradictions.length && listed.recommendation === detailJson.data.decision.recommendation,
      "목록 요약 = 결정 상세 API 결과(상충 개수·권고가 같은 계산에서 나옴)"
    );

    // 4) 응답에 원문·문서 본문이 실리지 않는다
    const raw = JSON.stringify(ownerJson);
    assert(!raw.includes("parsedText") && !raw.includes("네오비전 IR."), "응답에 문서 본문(parsedText)·원문 발췌가 없다");

    // 5) 같은 팀 ANALYST: 팀 공유 딜은 읽을 수 있음(읽기 전용)
    const teamCookie = await login(teammate.email, pw);
    const teamRes = await get(`/api/deals/decision-summaries?ids=${idsParam}`, teamCookie);
    const teamJson = (await teamRes.json()) as { data: Record<string, unknown> };
    const teamShared = await prisma.deal.findMany({ where: { id: { in: withReport }, teamId: owner.teamId }, select: { id: true } });
    assert(teamShared.length > 0, "(전제) 팀 공유된 보고서 딜이 최소 1건 있다 — 없으면 아래 검증이 공허해진다");
    assert(teamShared.every((d) => teamJson.data[d.id]), "같은 팀 사용자는 팀 공유 딜의 요약을 볼 수 있다");
    assert(!teamJson.data[privateDeal.id], "팀에 공유되지 않은 소유자 전용 딜은 같은 팀 사용자에게 보이지 않는다");
    const post = await fetch(`${BASE}/api/deals/decision-summaries?ids=${idsParam}`, { method: "POST", headers: { Cookie: teamCookie } });
    assert(post.status === 405, "이 API에는 쓰기 메서드가 없다(POST 405)");

    // 6) 외부인: 소유자의 id를 알아도 아무것도 못 받고, "없는 id"와 응답이 같다
    const outCookie = await login(outsider.email, pw);
    const outRes = await get(`/api/deals/decision-summaries?ids=${idsParam}`, outCookie);
    const outBody = await outRes.text();
    const fakeIds = encodeURIComponent([...withReport, ...withoutReport].map((_, i) => `nonexistent-${i}`).join(","));
    const fakeBody = await (await get(`/api/deals/decision-summaries?ids=${fakeIds}`, outCookie)).text();
    assert(outRes.status === 200 && JSON.parse(outBody).data && Object.keys(JSON.parse(outBody).data).length === 0, "외부인은 소유자의 딜 요약을 하나도 받지 못한다");
    assert(outBody === fakeBody, "외부인에게 '권한 없는 id'와 '없는 id'의 응답이 바이트 단위로 같다(존재 여부 비노출)");

    // 7) 입력 검증
    const tooMany = encodeURIComponent(Array.from({ length: 25 }, (_, i) => `id${i}`).join(","));
    assert((await get(`/api/deals/decision-summaries?ids=${tooMany}`, ownerCookie)).status === 400, "ids 25개(상한 24 초과)는 400");
    for (const bad of ["../../etc/passwd", "a'; DROP TABLE Deal;--", "<script>", "a b"]) {
      assert((await get(`/api/deals/decision-summaries?ids=${encodeURIComponent(bad)}`, ownerCookie)).status === 400, `이상한 id는 400: ${bad}`);
    }
    assert((await get(`/api/deals/decision-summaries`, ownerCookie)).status === 400, "ids 없음은 400");
    assert((await get(`/api/deals/decision-summaries?ids=`, ownerCookie)).status === 400, "빈 ids는 400");

    // 8) 중복 id는 한 번만 처리
    const dup = encodeURIComponent(Array(6).fill(anyId).join(","));
    const dupJson = (await (await get(`/api/deals/decision-summaries?ids=${dup}`, ownerCookie)).json()) as { data: Record<string, unknown> };
    assert(Object.keys(dupJson.data).length === 1, "같은 id를 반복해도 결과는 한 번");

    console.log(`\n${pass}개 통과`);
  } finally {
    await prisma.deal.deleteMany({ where: { id: privateDeal.id } });
    await prisma.user.deleteMany({ where: { id: { in: [teammate.id, outsider.id] } } });
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error(`\n❌ ${e instanceof Error ? e.message : e}`);
  await prisma.$disconnect();
  process.exit(1);
});
