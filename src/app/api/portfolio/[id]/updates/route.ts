import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateText } from "@/lib/claude";
import { comparePeriod, currentPeriod } from "@/lib/portfolio";
import {
  getUserTeamContext,
  portfolioWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

const bodySchema = z.object({
  period: z.string().regex(/^\d{4}Q[1-4]$/).optional(),
  summary: z.string().max(4000).optional(),
  highlights: z.string().max(2000).optional(),
  concerns: z.string().max(2000).optional(),
  /// true면 KPI·마일스톤을 바탕으로 AI가 요약을 작성한다
  autoSummarize: z.boolean().optional(),
});

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const company = await prisma.portfolioCompany.findFirst({
    where: {
      id: params.id,
      ...portfolioWriteWhere(session.user.id, teamId, role),
    },
    include: {
      kpis: { orderBy: { period: "asc" } },
      milestones: { orderBy: { dueDate: "asc" } },
    },
  });
  if (!company) {
    return NextResponse.json(
      { error: permissionDeniedMessage("edit") },
      { status: 403 }
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "입력 데이터가 올바르지 않습니다" },
      { status: 400 }
    );
  }
  const period = parsed.data.period ?? currentPeriod();

  let summary = parsed.data.summary ?? "";
  let highlights = parsed.data.highlights;
  let concerns = parsed.data.concerns;

  if (parsed.data.autoSummarize) {
    const kpiLines = [...company.kpis]
      .sort((a, b) => comparePeriod(a.period, b.period))
      .slice(-16)
      .map((k) => `- ${k.period} ${k.metric}: ${k.value}${k.unit}`)
      .join("\n");
    const msLines = company.milestones
      .map(
        (m) =>
          `- ${m.title} (기한 ${m.dueDate.toISOString().slice(0, 10)}, 상태 ${m.status})`
      )
      .join("\n");

    const prompt = `## 포트폴리오사 분기 모니터링 노트 작성
- 기업: ${company.companyName} (${company.sector})
- 투자: ${company.investAmount}억원, 지분 ${company.ownershipPercent}%
- 투자 시점 밸류: ${company.entryValuation}억원 / 현재 평가: ${company.currentValuation ?? "확인 필요"}억원
- 대상 분기: ${period}

## KPI 추이
${kpiLines || "등록된 KPI 없음"}

## 마일스톤
${msLines || "등록된 마일스톤 없음"}

## 작성 요청
아래 3개 항목만 정확히 이 형식으로 출력하세요.

[요약]
(3~5문장. KPI 추이의 방향성과 원인 추정, 밸류 변화 언급. 없는 수치는 "확인 필요")

[하이라이트]
- (2~3개 불릿)

[우려사항]
- (2~3개 불릿, 각 항목에 모니터링 지표 1개 포함)

문어체(~임, ~함). 과도한 확신 표현 금지.`;

    const result = await generateText([{ role: "user", content: prompt }], {
      maxTokens: 1500,
      temperature: 0.3,
    });

    const parsedOut = parseSections(result.content);
    summary = parsedOut.summary || result.content.slice(0, 1500);
    highlights = parsedOut.highlights || highlights;
    concerns = parsedOut.concerns || concerns;
  }

  if (!summary.trim()) {
    return NextResponse.json(
      { error: "요약 내용이 필요합니다" },
      { status: 400 }
    );
  }

  const update = await prisma.portfolioUpdate.upsert({
    where: { companyId_period: { companyId: params.id, period } },
    create: {
      companyId: params.id,
      period,
      summary,
      highlights,
      concerns,
    },
    update: { summary, highlights, concerns },
  });

  return NextResponse.json({ data: update }, { status: 201 });
}

/** [요약]/[하이라이트]/[우려사항] 블록 분리 */
function parseSections(text: string): {
  summary?: string;
  highlights?: string;
  concerns?: string;
} {
  const grab = (label: string) => {
    const re = new RegExp(`\\[${label}\\]\\s*([\\s\\S]*?)(?=\\n\\s*\\[|$)`);
    return re.exec(text)?.[1]?.trim();
  };
  return {
    summary: grab("요약"),
    highlights: grab("하이라이트"),
    concerns: grab("우려사항"),
  };
}
