/**
 * 위젯이 고객 응답을 저장하는 공개 API.
 * 카페24 주문 API로 주문이 실제로 있는지 확인하고 결제금액을 가져온다 — 화면에서 보낸 금액을 그대로 믿지 않는다.
 */
import { NextRequest } from "next/server";
import { z } from "zod";
import { Cafe24Error, isValidMallId, lookupOrder } from "@/lib/cafe24";
import { one, query } from "@/lib/db";
import { corsJson, corsPreflight } from "@/lib/http";
import { planState } from "@/lib/plan";
import { getSurvey, resolveAnswer } from "@/lib/survey";

export const dynamic = "force-dynamic";

const input = z.object({
  mall: z.string().refine(isValidMallId),
  order_id: z.string().trim().regex(/^[A-Za-z0-9_-]{4,40}$/),
  answer_id: z.string().trim().min(1).max(40),
  other_text: z.string().trim().max(100).optional().nullable(),
  amount_hint: z.number().int().min(0).max(100_000_000).optional().nullable(),
});

const MAX_ORDER_AGE_MS = 3 * 24 * 3600_000;

export function OPTIONS() {
  return corsPreflight();
}

export async function POST(req: NextRequest) {
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return corsJson({ ok: false, error: "invalid" }, 400);
  const { mall, order_id, answer_id, other_text, amount_hint } = parsed.data;

  const exists = await one(`SELECT mall_id FROM malls WHERE mall_id = $1`, [mall]);
  if (!exists) return corsJson({ ok: false, error: "unknown_mall" }, 404);
  const survey = await getSurvey(mall);
  const label = resolveAnswer(survey, answer_id);
  if (!survey.enabled || !label) return corsJson({ ok: false, error: "invalid_answer" }, 400);
  if ((await planState(mall)).paused) return corsJson({ ok: false, error: "paused" }, 402);

  const dup = await one(`SELECT id FROM responses WHERE mall_id = $1 AND order_id = $2`, [mall, order_id]);
  if (dup) return corsJson({ ok: true, duplicate: true });

  let amount: number | null = amount_hint ?? null;
  let verified = false;
  try {
    const order = await lookupOrder(mall, order_id);
    if (!order.found) return corsJson({ ok: false, error: "unknown_order" }, 404);
    if (order.orderedAt && Date.now() - order.orderedAt.getTime() > MAX_ORDER_AGE_MS) {
      return corsJson({ ok: false, error: "order_too_old" }, 400);
    }
    amount = order.amount ?? amount;
    verified = true;
  } catch (e) {
    // 카페24 API 일시 장애·토큰 만료 시에도 응답은 받는다. 대시보드에 "미확인"으로 표시된다.
    console.warn("[responses] order lookup failed", mall, e instanceof Cafe24Error ? e.message : e);
  }

  await query(
    `INSERT INTO responses (mall_id, order_id, answer_id, answer_label, other_text, amount, verified)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (mall_id, order_id) DO NOTHING`,
    [mall, order_id, answer_id, label, answer_id === "other" ? other_text || null : null, amount, verified]
  );
  return corsJson({ ok: true });
}
