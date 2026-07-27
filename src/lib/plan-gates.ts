import { NextResponse } from "next/server";
import { getUserPlanKey } from "@/lib/subscription";
import { featureLockMessage, hasFeature, type PlanFeature } from "@/lib/plans";

/**
 * API 라우트에서 기능 접근을 막는다.
 * 잠겨 있으면 402(Payment Required) 응답을, 아니면 null을 반환한다.
 */
export async function requireFeature(
  userId: string,
  feature: PlanFeature
): Promise<NextResponse | null> {
  const plan = await getUserPlanKey(userId);
  if (hasFeature(plan, feature)) return null;

  return NextResponse.json(
    {
      error: featureLockMessage(feature),
      code: "PLAN_UPGRADE_REQUIRED",
      feature,
      currentPlan: plan,
    },
    { status: 402 }
  );
}

/** 서버 컴포넌트에서 잠금 여부만 확인할 때 */
export async function checkFeature(
  userId: string,
  feature: PlanFeature
): Promise<{ allowed: boolean; message: string }> {
  const plan = await getUserPlanKey(userId);
  const allowed = hasFeature(plan, feature);
  return { allowed, message: allowed ? "" : featureLockMessage(feature) };
}
