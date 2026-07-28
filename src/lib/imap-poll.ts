/**
 * 딜소싱 인박스 폴링.
 * IMAP 직접 연결 또는 드롭 폴더(.eml) 스캔.
 */

import { readdir, readFile, rename, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { parseInboundEmail } from "@/lib/email-parser";
import { guessSector } from "@/lib/sourcing";

export interface PollResult {
  imported: number;
  skipped: number;
  errors: string[];
  leads: Array<{ id: string; companyName: string }>;
}

async function importRawEmail(
  userId: string,
  rawEmail: string
): Promise<{ id: string; companyName: string } | null> {
  const parsed = parseInboundEmail(rawEmail);
  const companyName =
    parsed.companyName ||
    parsed.subject?.replace(/\[|\]|IR|투자/gi, "").trim() ||
    "미확인 기업";

  // 동일 원문 중복 방지 (앞 200자 해시 대용)
  const fingerprint = rawEmail.slice(0, 200);
  const existing = await prisma.inboundDeal.findFirst({
    where: {
      userId,
      rawText: { contains: fingerprint.slice(0, 80) },
    },
    select: { id: true },
  });
  if (existing) return null;

  const lead = await prisma.inboundDeal.create({
    data: {
      userId,
      companyName,
      sector: guessSector(parsed.rawText),
      source: "INBOUND",
      contactName: parsed.contactName,
      contactEmail: parsed.contactEmail,
      summary: parsed.summary,
      rawText: parsed.rawText,
    },
  });

  return { id: lead.id, companyName: lead.companyName };
}

/** 드롭 폴더에서 .eml 파일을 읽어 인바운드로 등록 */
export async function pollInboxDirectory(
  userId: string,
  inboxDir: string
): Promise<PollResult> {
  const result: PollResult = { imported: 0, skipped: 0, errors: [], leads: [] };

  try {
    await mkdir(inboxDir, { recursive: true });
    await mkdir(path.join(inboxDir, "processed"), { recursive: true });
  } catch {
    /* ignore */
  }

  let files: string[] = [];
  try {
    files = (await readdir(inboxDir)).filter(
      (f) => f.endsWith(".eml") || f.endsWith(".txt")
    );
  } catch (e) {
    result.errors.push(
      `인박스 디렉터리 읽기 실패: ${e instanceof Error ? e.message : e}`
    );
    return result;
  }

  for (const file of files) {
    const full = path.join(inboxDir, file);
    try {
      const raw = await readFile(full, "utf8");
      const lead = await importRawEmail(userId, raw);
      if (!lead) {
        result.skipped += 1;
      } else {
        result.imported += 1;
        result.leads.push(lead);
      }
      await rename(full, path.join(inboxDir, "processed", `${Date.now()}-${file}`));
    } catch (e) {
      result.errors.push(`${file}: ${e instanceof Error ? e.message : e}`);
    }
  }

  return result;
}

/**
 * IMAP 폴링 (선택).
 * IMAP_HOST / IMAP_USER / IMAP_PASS / IMAP_MAILBOX 환경변수 필요.
 * imapflow가 설치되어 있으면 사용하고, 없으면 에러를 반환한다.
 */
export async function pollImapMailbox(userId: string): Promise<PollResult> {
  const result: PollResult = { imported: 0, skipped: 0, errors: [], leads: [] };

  const host = process.env.IMAP_HOST;
  const user = process.env.IMAP_USER;
  const pass = process.env.IMAP_PASS;
  const mailbox = process.env.IMAP_MAILBOX ?? "INBOX";

  if (!host || !user || !pass) {
    result.errors.push("IMAP_HOST / IMAP_USER / IMAP_PASS 가 필요합니다");
    return result;
  }

  try {
    // webpack이 정적 해석하지 않도록 Function으로 동적 로드
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const dynamicImport = new Function(
      "specifier",
      "return import(specifier)"
    ) as (s: string) => Promise<{ ImapFlow: new (opts: Record<string, unknown>) => {
      connect: () => Promise<void>;
      logout: () => Promise<void>;
      mailboxOpen: (name: string) => Promise<unknown>;
      search: (query: Record<string, unknown>) => Promise<number[]>;
      fetch: (
        range: number | number[],
        opts: Record<string, unknown>
      ) => AsyncIterable<{ source?: Buffer; uid: number }>;
      messageFlagsAdd: (uid: number, flags: string[]) => Promise<unknown>;
    } }>;

    let ImapFlowCtor: Awaited<ReturnType<typeof dynamicImport>>["ImapFlow"];
    try {
      const mod = await dynamicImport("imapflow");
      ImapFlowCtor = mod.ImapFlow;
    } catch {
      result.errors.push(
        "imapflow 패키지가 없습니다. SOURCING_INBOX_DIR 드롭 폴더 또는 Webhook을 사용하세요."
      );
      return result;
    }

    const client = new ImapFlowCtor({
      host,
      port: Number(process.env.IMAP_PORT ?? 993),
      secure: process.env.IMAP_SECURE !== "false",
      auth: { user, pass },
      logger: false,
    });

    await client.connect();
    await client.mailboxOpen(mailbox);

    const uids: number[] = await client.search({ seen: false });
    for (const uid of uids.slice(0, 20)) {
      try {
        for await (const msg of client.fetch(uid, { source: true })) {
          const raw = msg.source?.toString("utf8") ?? "";
          if (raw.length < 20) {
            result.skipped += 1;
            continue;
          }
          const lead = await importRawEmail(userId, raw);
          if (!lead) result.skipped += 1;
          else {
            result.imported += 1;
            result.leads.push(lead);
          }
          await client.messageFlagsAdd(uid, ["\\Seen"]);
        }
      } catch (e) {
        result.errors.push(`uid ${uid}: ${e instanceof Error ? e.message : e}`);
      }
    }

    await client.logout();
  } catch (e) {
    result.errors.push(e instanceof Error ? e.message : String(e));
  }

  return result;
}
