/** 쇼핑몰 주문완료 화면의 위젯이 설문 내용을 가져가는 공개 API */
import { NextRequest } from "next/server";
import { isValidMallId } from "@/lib/cafe24";
import { one } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/http";
import { planState } from "@/lib/plan";
import { getSurvey } from "@/lib/survey";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return corsPreflight();
}

export async function GET(req: NextRequest) {
  const mallId = req.nextUrl.searchParams.get("mall") || "";
  if (!isValidMallId(mallId)) return corsJson({ show: false });
  const mall = await one(`SELECT mall_id FROM malls WHERE mall_id = $1`, [mallId]);
  if (!mall) return corsJson({ show: false });
  const survey = await getSurvey(mallId);
  if (!survey.enabled) return corsJson({ show: false });
  const plan = await planState(mallId);
  if (plan.paused) return corsJson({ show: false });
  return corsJson({
    show: true,
    question: survey.question,
    options: survey.options,
    allow_other: survey.allow_other,
    randomize: survey.randomize,
  });
}
