import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateText, isAIConfigured } from "@/lib/claude";

const SECTOR_LABELS: Record<string, string> = {
  BIO: "바이오/헬스케어",
  IT: "IT/SaaS",
  DEEPTECH: "AI/딥테크",
  MANUFACTURING: "제조/하드웨어",
  CONTENT: "콘텐츠/엔터",
  FINTECH: "핀테크/금융",
  CONSUMER: "소비재",
  CLIMATE: "기후/ESG",
  GENERAL: "일반",
};

/** Keyword-based fallback when AI is not configured */
function detectSectorByKeyword(text: string): { sector: string; reason: string } {
  const lower = text.toLowerCase();
  if (/임상|신약|바이오|헬스케어|제약|의료기기|pipeline|clinical|drug|pharma/.test(lower))
    return { sector: "BIO", reason: "임상/신약 관련 키워드 감지" };
  if (/llm|gpt|ai|machine learning|딥러닝|인공지능|반도체|로봇|양자/.test(lower))
    return { sector: "DEEPTECH", reason: "AI/딥테크 키워드 감지" };
  if (/saas|arr|mrr|구독|클라우드|플랫폼|api|소프트웨어/.test(lower))
    return { sector: "IT", reason: "SaaS/소프트웨어 키워드 감지" };
  if (/결제|payment|tpv|핀테크|인슈어|대출|은행|금융/.test(lower))
    return { sector: "FINTECH", reason: "핀테크/금융 키워드 감지" };
  if (/제조|공장|bom|capex|생산|부품|소재|하드웨어/.test(lower))
    return { sector: "MANUFACTURING", reason: "제조/하드웨어 키워드 감지" };
  if (/콘텐츠|엔터|ip|아티스트|팬덤|드라마|영화|게임|웹툰/.test(lower))
    return { sector: "CONTENT", reason: "콘텐츠/엔터 키워드 감지" };
  if (/esg|탄소|기후|환경|재생에너지|solar/.test(lower))
    return { sector: "CLIMATE", reason: "기후/ESG 키워드 감지" };
  return { sector: "GENERAL", reason: "명확한 섹터 특정 불가" };
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const deal = await prisma.deal.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      documents: { select: { name: true, parsedText: true } },
    },
  });

  if (!deal) {
    return NextResponse.json({ error: "딜을 찾을 수 없습니다" }, { status: 404 });
  }

  if (!deal.documents.length) {
    return NextResponse.json({ error: "업로드된 문서가 없습니다" }, { status: 400 });
  }

  // Build document excerpt (max 3000 chars)
  const docExcerpt = deal.documents
    .filter((d) => d.parsedText)
    .map((d) => `[${d.name}]\n${d.parsedText!.slice(0, 1000)}`)
    .join("\n\n")
    .slice(0, 3000);

  if (!isAIConfigured()) {
    const result = detectSectorByKeyword(docExcerpt);
    return NextResponse.json({ data: { ...result, label: SECTOR_LABELS[result.sector] } });
  }

  const prompt = `다음은 투자 대상 기업의 IR 자료 일부입니다.

${docExcerpt}

---
위 자료를 읽고 이 기업의 투자 섹터를 아래 중 하나로 분류해주세요:
BIO | IT | DEEPTECH | MANUFACTURING | CONTENT | FINTECH | CONSUMER | CLIMATE | GENERAL

반드시 JSON 형식으로만 응답하세요:
{"sector": "BIO", "reason": "임상 3상 파이프라인 및 신약 개발 기업으로 판단"}`;

  try {
    const result = await generateText(
      [{ role: "user", content: prompt }],
      { maxTokens: 200 }
    );

    // Extract JSON from response
    const jsonMatch = result.content.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as { sector: string; reason: string };
      const sector = parsed.sector in SECTOR_LABELS ? parsed.sector : "GENERAL";
      return NextResponse.json({
        data: { sector, reason: parsed.reason, label: SECTOR_LABELS[sector] },
      });
    }
  } catch {
    // Fall through to keyword fallback
  }

  const fallback = detectSectorByKeyword(docExcerpt);
  return NextResponse.json({
    data: { ...fallback, label: SECTOR_LABELS[fallback.sector] },
  });
}
