import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { pollInboxDirectory, pollImapMailbox } from "@/lib/imap-poll";

/**
 * Cron/수동 폴링 엔드포인트.
 * 헤더 X-Webhook-Secret = SOURCING_WEBHOOK_SECRET
 *
 * 우선순위:
 * 1) IMAP_* 설정 시 IMAP 미읽음 메일
 * 2) SOURCING_INBOX_DIR 의 .eml/.txt 드롭 폴더
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-webhook-secret");
  const expected = process.env.SOURCING_WEBHOOK_SECRET;

  if (!expected || secret !== expected) {
    return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  }

  const ownerEmail =
    new URL(request.url).searchParams.get("userEmail") ||
    process.env.SOURCING_WEBHOOK_USER_EMAIL;

  if (!ownerEmail) {
    return NextResponse.json(
      { error: "userEmail 또는 SOURCING_WEBHOOK_USER_EMAIL 필요" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { email: ownerEmail } });
  if (!user) {
    return NextResponse.json({ error: "사용자를 찾을 수 없습니다" }, { status: 404 });
  }

  const results = [];

  if (process.env.IMAP_HOST) {
    results.push({ source: "imap", ...(await pollImapMailbox(user.id)) });
  }

  const inboxDir = process.env.SOURCING_INBOX_DIR ?? "./inbox";
  results.push({
    source: "directory",
    dir: inboxDir,
    ...(await pollInboxDirectory(user.id, inboxDir)),
  });

  const imported = results.reduce((s, r) => s + r.imported, 0);

  return NextResponse.json({ data: { imported, results } });
}
