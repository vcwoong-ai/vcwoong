/** 공식 REST 요청/응답 모양을 합성 fetch로 검증한다. 실제 키나 네트워크 없음. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

async function main() {
  const syntheticKey = "synthetic&+/=?key", requests: URL[] = [], logs: string[] = [];
  let responses: Array<string | Error> = [];
  const exports: Record<string, any> = {};
  const xml = (items: string) => `<response><header><resultCode>00</resultCode></header><body><items>${items}</items></body></response>`;
  const item = (number: string, date: string) => `<PatentUtilityInfo><ApplicationNumber>${number}</ApplicationNumber><ApplicationDate>${date}</ApplicationDate><InventionName>AI &amp; 치료</InventionName><Applicant>합성 회사</Applicant><RegistrationStatus>등록</RegistrationStatus><InternationalpatentclassificationNumber>A61K</InternationalpatentclassificationNumber></PatentUtilityInfo>`;
  vm.runInNewContext(ts.transpileModule(fs.readFileSync("src/lib/bio/kipris.ts", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, URL, URLSearchParams, AbortSignal, process: { env: { KIPRIS_API_KEY: syntheticKey } },
    console: { log: (...args: unknown[]) => logs.push(args.join(" ")), warn: (...args: unknown[]) => logs.push(args.join(" ")) },
    require: (name: string) => { assert.equal(name, "@/lib/brand"); return { BRAND: { name: "DealMind" } }; },
    fetch: async (address: string, options: any) => {
      const url = new URL(address); requests.push(url);
      assert.equal(url.protocol, "https:"); assert.equal(url.hostname, "plus.kipris.or.kr");
      assert.equal(url.searchParams.get("accessKey"), syntheticKey);
      assert.equal(url.searchParams.get("docsStart"), "1"); assert.equal(options.redirect, "error");
      assert(!url.searchParams.has("ServiceKey")); assert(!url.searchParams.has("numOfRows"));
      const body = responses.shift(); if (body instanceof Error) throw body;
      assert.equal(typeof body, "string"); return new Response(body as string, { status: 200 });
    }, Response,
  });
  responses = [xml(item("old", "20230101") + item("new", "20260101"))];
  const first = await exports.searchKiprisPatents("합성 회사", 2);
  assert.equal(first.length, 2); assert.equal(first[0].applicationNumber, "new");
  assert.equal(first[0].inventionTitle, "AI & 치료"); assert.equal(first[0].registerStatus, "등록");
  assert.equal(first[0].applicantName, "합성 회사"); assert.equal(first[0].ipc, "A61K"); assert.equal(first[0].url, "");
  assert.equal(requests[0].searchParams.get("applicant"), "합성 회사");
  assert.equal(requests[0].searchParams.get("docsCount"), "2");
  responses = [xml(""), xml(item("fallback", "20250101"))];
  assert.equal((await exports.searchKiprisPatents("합성", 1000))[0].applicationNumber, "fallback");
  assert(requests[2].pathname.endsWith("/freeSearchInfo"));
  assert.equal(requests[2].searchParams.get("word"), "합성"); assert.equal(requests[2].searchParams.get("docsCount"), "20");
  const beforeDenied = requests.length;
  responses = ["<response><header><resultCode>101</resultCode></header></response>"];
  assert.equal((await exports.searchKiprisPatents("합성")).length, 0);
  assert.equal(requests.length, beforeDenied + 1, "Denied API must not consume a second request");
  responses = [new Error(`private transport URL?accessKey=${syntheticKey}`)];
  await exports.searchKiprisPatents("합성");
  assert(!logs.join("\n").includes(syntheticKey)); assert(!logs.join("\n").includes("accessKey"));
  const beforeEmpty = requests.length;
  await exports.searchKiprisPatents("   "); assert.equal(requests.length, beforeEmpty);
  console.log("PASS KIPRIS API contract: HTTPS, encoded accessKey, official paging/items, fallback, result errors and secret-safe logs (offline)");
}
main().catch(() => { console.error("FAIL KIPRIS API contract"); process.exitCode = 1; });
