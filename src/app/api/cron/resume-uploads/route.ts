import { NextResponse } from "next/server";
import { Prisma, TemplateStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { secureCompare } from "@/lib/secure-compare";
import { recoverDocument, recoverTemplate, readRecoveryState, UPLOAD_LEASE_MS, LEGACY_PENDING_WARNING } from "@/lib/upload-recovery";

export const maxDuration = 240;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !secureCompare(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return NextResponse.json({ error: "인증 실패" }, { status: 401 });
  const now = Date.now();
  // SQLite and PostgreSQL use different Prisma JSON path encodings.
  const statePath = process.env.DATABASE_URL?.startsWith("file:") ? "$.__uploadRecovery.status" : ["__uploadRecovery", "status"];
  const metadataFilter = { OR: [
    { metadata: { path: statePath, equals: "queued" } },
    { metadata: { path: statePath, equals: "running" } },
    { metadata: { equals: { warning: LEGACY_PENDING_WARNING } } },
  ] } as Prisma.DocumentWhereInput;
  const [documents, templates] = await Promise.all([
    prisma.document.findMany({ where: { parsedText: null, ...metadataFilter }, orderBy: { createdAt: "asc" }, take: 20, select: { id: true, metadata: true, createdAt: true } }),
    prisma.template.findMany({ where: { status: TemplateStatus.ANALYZING }, orderBy: { updatedAt: "asc" }, take: 20, select: { id: true, structure: true, updatedAt: true, createdAt: true } }),
  ]);
  const candidates: Array<{ id: string; kind: "document" | "template"; createdAt: Date }> = [];
  for (const row of documents) {
    const state = readRecoveryState(row.metadata);
    const eligible = state ? (state.status === "queued" && state.retryAfter <= now) || (state.status === "running" && state.leaseExpiresAt <= now) : row.createdAt.getTime() + UPLOAD_LEASE_MS <= now;
    if (eligible) candidates.push({ id: row.id, kind: "document", createdAt: row.createdAt });
  }
  for (const row of templates) {
    const state = readRecoveryState(row.structure);
    const eligible = state ? (state.status === "queued" && state.retryAfter <= now) || (state.status === "running" && state.leaseExpiresAt <= now) : row.updatedAt.getTime() + UPLOAD_LEASE_MS <= now;
    if (eligible) candidates.push({ id: row.id, kind: "template", createdAt: row.createdAt });
  }
  // One total attempt avoids adding a second AI operation to the 240-second budget.
  const candidate = candidates.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())[0];
  let completed = false;
  if (candidate) completed = candidate.kind === "document" ? await recoverDocument(candidate.id) : await recoverTemplate(candidate.id);
  return NextResponse.json({ data: { attempted: candidate ? 1 : 0, completed } }, { headers: { "Cache-Control": "private, no-store" } });
}
