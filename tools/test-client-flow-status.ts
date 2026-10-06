import assert from "node:assert/strict";
import { isSuccessfulSignIn, uploadRejectionMessage, withCleanup } from "../src/lib/client-flow-status";

async function main() {
  for (const response of [undefined, null, {}, { ok: false }, { ok: true, error: "CredentialsSignin" }, { ok: false, error: null }]) {
    assert.equal(isSuccessfulSignIn(response), false);
  }
  assert.equal(isSuccessfulSignIn({ ok: true, error: null }), true);
  let cleanups = 0;
  assert.equal(await withCleanup(async () => "uploaded", () => cleanups++), "uploaded");
  assert.equal(cleanups, 1);
  await assert.rejects(withCleanup(async () => { throw new Error("synthetic offline network failure"); }, () => cleanups++));
  assert.equal(cleanups, 2, "upload progress cleanup also runs when the request rejects");
  assert.equal(uploadRejectionMessage([]), "");
  const message = uploadRejectionMessage([
    { file: { name: "too-large.pdf" }, errors: [{ code: "file-too-large" }] },
    { file: { name: "unsupported.exe" }, errors: [{ code: "file-invalid-type" }] },
  ]);
  assert(message.includes("too-large.pdf: 최대 50MB"));
  assert(message.includes("unsupported.exe: 지원하지 않는 파일 형식"));
  assert(uploadRejectionMessage([{ file: { name: "other.txt" }, errors: [{ code: "unknown" }] }]).includes("파일을 업로드할 수 없습니다"));
  console.log("Offline authentication confirmation/upload rejection/request cleanup regressions passed.");
}
main().catch(() => { console.error("Offline client flow regression failed."); process.exitCode = 1; });
