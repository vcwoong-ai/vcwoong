import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { calculatePortfolioNPV, type Pipeline } from "@/agents/sectors/bio/pipeline-npv";

const pipelineSchema = z.object({
  name: z.string(),
  indication: z.string(),
  currentStage: z.enum(["preclinical", "P1", "P2", "P3", "NDA", "approved"]),
  estimatedLaunchYear: z.number(),
  peakSalesEstimate: z.number(),
  patentExpiryYear: z.number().optional(),
});

const schema = z.object({
  pipelines: z.array(pipelineSchema).min(1),
  options: z
    .object({
      discountRate: z.number().optional(),
      salesDuration: z.number().optional(),
    })
    .optional(),
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

  const result = calculatePortfolioNPV(
    parsed.data.pipelines as Pipeline[],
    parsed.data.options
  );
  return NextResponse.json(result);
}
