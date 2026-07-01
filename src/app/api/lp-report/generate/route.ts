import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { generateLPReport } from "@/agents/sectors/lp-reporting";

const portfolioCompanySchema = z.object({
  name: z.string(),
  sector: z.string(),
  investmentDate: z.string(),
  investmentAmountKRW: z.number(),
  currentValuation: z.number().optional(),
  entryValuation: z.number(),
  ownershipPercent: z.number(),
  stage: z.string(),
  revenueLatest: z.number().optional(),
  revenueGrowthYoY: z.number().optional(),
  headcount: z.number().optional(),
  runwayMonths: z.number().optional(),
  highlights: z.array(z.string()),
  risks: z.array(z.string()),
  nextMilestones: z.array(z.string()),
  status: z.enum(["healthy", "watch", "concern", "exited"]),
});

const schema = z.object({
  fund: z.object({
    fundName: z.string(),
    vintageYear: z.number(),
    totalCommitment: z.number(),
    investedCapital: z.number(),
    remainingCapital: z.number(),
    managementFeeRate: z.number(),
    carryRate: z.number(),
    investmentPeriodEnd: z.string(),
    fundTermEnd: z.string(),
  }),
  portfolio: z.array(portfolioCompanySchema),
  reportingPeriod: z.string(),
  currency: z.enum(["KRW", "USD"]).default("KRW"),
  additionalNarrative: z.string().optional(),
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

  const result = await generateLPReport(parsed.data);
  return NextResponse.json(result);
}
