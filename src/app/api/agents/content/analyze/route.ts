import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { runContentAnalysis } from "@/agents/sectors/content";

const schema = z.object({
  structuredData: z.record(z.string(), z.unknown()),
});

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await runContentAnalysis(parsed.data.structuredData as any);
  return NextResponse.json(result);
}
