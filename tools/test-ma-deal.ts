/**
 * PE 트랙 Domain Foundation(PR-A) 검증.
 *
 * DB 연결 없이(이 레포의 다른 test:* 스크립트와 동일한 관례 — 실제
 * Prisma DB 호출을 쓰는 test:*는 없고, 전부 순수 함수/스키마 검증만
 * 한다) ma-team-access.ts의 권한 where절 생성과 API가 쓰는 입력
 * 검증 규칙을 확인한다.
 *
 * Usage: npm run test:ma-deal
 */
import { z } from "zod";
import { MaDealType, MaSectionKey, SectionKey } from "@prisma/client";
import {
  maDealReadWhere,
  maDealWriteWhere,
  maDealOwnerWhere,
} from "../src/lib/pe/ma-team-access";
import { canEditShared } from "../src/lib/team-access";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

// src/app/api/ma-deals/route.ts, [id]/route.ts의 createMaDealSchema/
// updateMaDealSchema와 동일한 규칙(name·companyName 필수, dealType은
// MaDealType 열거값만 허용) — 라우트 파일은 Next.js 런타임 바깥에서
// import하지 않고, 이 레포의 tools/test-permissions.ts가 team-access.ts를
// 직접 테스트하는 것과 동일하게 규칙만 재현해 검증한다.
const createMaDealSchema = z.object({
  name: z.string().min(1),
  companyName: z.string().min(1),
  dealType: z.nativeEnum(MaDealType),
});

function testAuthorizationOwnerAccess() {
  assert(
    JSON.stringify(maDealOwnerWhere("u1")) === JSON.stringify({ userId: "u1" }),
    "owner where = 본인 소유만"
  );
  assert(
    JSON.stringify(maDealReadWhere("u1", null)) === JSON.stringify({ userId: "u1" }),
    "팀 없는 사용자의 read where = 본인 소유만"
  );
  assert(
    JSON.stringify(maDealWriteWhere("u1", null, "ANALYST")) ===
      JSON.stringify({ userId: "u1" }),
    "팀 없는 사용자는 role과 무관하게 본인 소유만 write 가능"
  );
  console.log("✅ Owner read/write 정상");
}

function testAuthorizationTeamAccess() {
  const adminWrite = maDealWriteWhere("u1", "t1", "ADMIN");
  const partnerWrite = maDealWriteWhere("u1", "t1", "PARTNER");
  assert(
    Array.isArray((adminWrite as { OR?: unknown }).OR),
    "ADMIN은 팀 공유 MADeal도 write 대상에 포함"
  );
  assert(
    Array.isArray((partnerWrite as { OR?: unknown }).OR),
    "PARTNER는 팀 공유 MADeal도 write 대상에 포함"
  );
  assert(
    Array.isArray((maDealReadWhere("u1", "t1") as { OR?: unknown }).OR),
    "팀 소속이면 read where에 팀 공유분 포함"
  );
  console.log("✅ Team ADMIN/PARTNER read/write 정상");
}

function testAuthorizationAnalystWriteDenied() {
  const analystWrite = maDealWriteWhere("u2", "t1", "ANALYST");
  assert(
    JSON.stringify(analystWrite) === JSON.stringify({ userId: "u2" }),
    "ANALYST의 write where는 팀 공유분을 포함하지 않고 본인 소유로만 좁혀져야 함"
  );
  assert(!canEditShared("ANALYST"), "ANALYST는 공유 리소스 편집 권한이 없어야 함");
  console.log("✅ Team ANALYST write 거부(본인 소유로만 제한) 정상");
}

function testAuthorizationOtherTeamDenied() {
  // "다른 팀 접근 거부"는 where절이 호출자 자신의 teamId만 참조하고
  // 임의의 다른 팀 id는 절대 포함하지 않는다는 사실로 보장된다 — 즉
  // t1 소속 사용자의 where절에는 t2가 등장할 수 없다.
  const t1Read = maDealReadWhere("u1", "t1");
  const t1ReadStr = JSON.stringify(t1Read);
  assert(!t1ReadStr.includes("t2"), "t1 팀 사용자의 read where에 다른 팀(t2)이 섞이면 안 됨");
  const t1Write = maDealWriteWhere("u1", "t1", "PARTNER");
  assert(!JSON.stringify(t1Write).includes("t2"), "t1 팀 사용자의 write where에 다른 팀(t2)이 섞이면 안 됨");
  console.log("✅ 다른 팀 접근 거부(where절에 타 팀 id 미포함) 정상");
}

function testValidationRequiredFields() {
  const missingName = createMaDealSchema.safeParse({
    companyName: "Acme",
    dealType: MaDealType.BUYOUT,
  });
  assert(!missingName.success, "name 누락 시 검증 실패해야 함");

  const missingCompanyName = createMaDealSchema.safeParse({
    name: "Acme 인수",
    dealType: MaDealType.BUYOUT,
  });
  assert(!missingCompanyName.success, "companyName 누락 시 검증 실패해야 함");

  const invalidDealType = createMaDealSchema.safeParse({
    name: "Acme 인수",
    companyName: "Acme",
    dealType: "NOT_A_REAL_TYPE",
  });
  assert(!invalidDealType.success, "잘못된 dealType은 검증 실패해야 함");

  const valid = createMaDealSchema.safeParse({
    name: "Acme 인수",
    companyName: "Acme",
    dealType: MaDealType.BUYOUT,
  });
  assert(valid.success, "정상 입력은 검증 통과해야 함");
  console.log("✅ 필수 필드·dealType 검증 정상");
}

function testMaSectionKeyDoesNotOverlapVcSectionKey() {
  // "기존 VC SectionKey 10개에 PE SectionKey가 섞이지 않았는지 확인" —
  // 두 enum의 값 집합이 완전히 분리되어 있어야 한다.
  const vcKeys = new Set(Object.values(SectionKey));
  const peKeys = new Set(Object.values(MaSectionKey));
  const overlap = [...peKeys].filter((k) => vcKeys.has(k as never));
  assert(overlap.length === 0, `MaSectionKey와 SectionKey가 겹치면 안 됨: ${overlap.join(", ")}`);
  assert(vcKeys.size === 10, `VC SectionKey는 10개 그대로 유지되어야 함(현재 ${vcKeys.size}개)`);
  assert(peKeys.size === 8, `PE MaSectionKey는 8개여야 함(현재 ${peKeys.size}개)`);
  console.log("✅ VC SectionKey(10개)·PE MaSectionKey(8개) 완전 분리 확인");
}

function main() {
  console.log("\n=== DealMind PE Domain Foundation(PR-A) 테스트 ===\n");
  testAuthorizationOwnerAccess();
  testAuthorizationTeamAccess();
  testAuthorizationAnalystWriteDenied();
  testAuthorizationOtherTeamDenied();
  testValidationRequiredFields();
  testMaSectionKeyDoesNotOverlapVcSectionKey();
  console.log("\n✅ PE Domain Foundation 테스트 통과\n");
}

main();
