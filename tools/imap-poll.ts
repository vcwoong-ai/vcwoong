#!/usr/bin/env npx tsx
/**
 * 딜소싱 인박스 폴링 CLI
 * Usage:
 *   SOURCING_WEBHOOK_SECRET=... SOURCING_WEBHOOK_USER_EMAIL=demo@dealmind.kr \
 *     npx tsx tools/imap-poll.ts
 *
 * 또는 로컬에서:
 *   curl -X POST -H "X-Webhook-Secret: $SOURCING_WEBHOOK_SECRET" \
 *     "http://localhost:3000/api/sourcing/poll"
 */
const base = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
const secret = process.env.SOURCING_WEBHOOK_SECRET;
const email = process.env.SOURCING_WEBHOOK_USER_EMAIL;

if (!secret) {
  console.error("SOURCING_WEBHOOK_SECRET 필요");
  process.exit(1);
}

async function runPollCli() {
  const url = new URL("/api/sourcing/poll", base);
  if (email) url.searchParams.set("userEmail", email);

  const res = await fetch(url, {
    method: "POST",
    headers: { "X-Webhook-Secret": secret! },
  });
  const json = await res.json();
  if (!res.ok) {
    console.error(json);
    process.exit(1);
  }
  console.log(JSON.stringify(json, null, 2));
}

runPollCli();
