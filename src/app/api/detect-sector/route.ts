import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { structurizeDocument } from "@/lib/structurize";
import { detectSectors } from "@/agents/orchestrator/sector-detector";

const schema = z.object({
  text: z.string().min(1, "텍스트를 입력해주세요"),
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

  const { data: structured } = await structurizeDocument(parsed.data.text);
  const detection = await detectSectors(structured, parsed.data.text);

  return NextResponse.json({ detection, structured });
}
