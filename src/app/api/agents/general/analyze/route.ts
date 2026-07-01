import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { runGeneralAnalysis } from "@/agents/general";
import { z } from "zod";

const schema = z.object({
  documentContext: z.string().min(1),
  companyName: z.string().min(1),
  sector: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const result = await runGeneralAnalysis(
    parsed.data.documentContext,
    parsed.data.companyName,
    parsed.data.sector
  );
  return NextResponse.json({ data: result });
}
