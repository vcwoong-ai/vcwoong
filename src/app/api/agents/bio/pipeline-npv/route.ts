import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { calculatePortfolioNPV, type Pipeline } from "@/agents/sectors/bio/pipeline-npv";
import { z } from "zod";

const pipelineSchema = z.object({
  name: z.string(),
  indication: z.string(),
  currentStage: z.enum(["preclinical", "P1", "P2", "P3", "NDA", "approved"]),
  estimatedLaunchYear: z.number(),
  peakSalesEstimate: z.number(),
  patentExpiryYear: z.number().optional(),
});

const schema = z.object({
  pipelines: z.array(pipelineSchema),
  options: z
    .object({
      discountRate: z.number().optional(),
      salesDuration: z.number().optional(),
    })
    .optional(),
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

  const result = calculatePortfolioNPV(
    parsed.data.pipelines as Pipeline[],
    parsed.data.options
  );
  return NextResponse.json({ data: result });
}
