import assert from "node:assert/strict";
import { createTossBillingIssuer } from "../src/lib/payments/toss-billing-issuer";

async function main() {
  const marker = "synthetic-private-only";
  let calls = 0;
  let mode = "success";
  const issue = createTossBillingIssuer({ authorization: async () => "Basic synthetic-only",
    fetch: async (url, init) => {
      calls++;
      assert.equal(url, "https://api.tosspayments.com/v1/billing/authorizations/issue");
      assert.equal(init.redirect, "error"); assert.equal(init.cache, "no-store");
      assert.equal(JSON.parse(init.body as string).authKey, marker);
      if (mode === "throw") throw new Error(marker);
      if (mode === "bad-status") return Response.json({ message: marker }, { status: 500 });
      if (mode === "wrong-customer") return Response.json({ customerKey: "another-customer", billingKey: marker });
      return Response.json({ customerKey: "synthetic-customer", billingKey: marker });
    } });
  assert.equal((await issue(marker, "synthetic-customer")).billingKey, marker);
  for (mode of ["throw", "bad-status", "wrong-customer"]) {
    await assert.rejects(issue(marker, "synthetic-customer"), (error: unknown) => (error as Error).message === "Billing authorization requires review");
  }
  assert.equal(calls, 4, "Issuer does not automatically retry ambiguous issuance");
  await assert.rejects(issue("x".repeat(301), "synthetic-customer"));
  await assert.rejects(issue(marker, "invalid/customer"));
  assert.equal(calls, 4);
  console.log("Synthetic issuance validates customer binding, limits, fixed host, safe failures and no automatic retries.");
}
main().catch(() => { console.error("Billing issuer regression failed."); process.exitCode = 1; });
