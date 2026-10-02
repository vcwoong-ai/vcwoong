/**
 * 카페24 인앱 결제 (BILLING_MODE=cafe24 일 때만 사용).
 * 앱스토어 주문 생성 → 운영자가 카페24 결제 화면에서 결제 → return_url 로 복귀 → 결제 내역 확인 후 Pro 31일.
 *
 * 주의: 카페24 개발자 문서 접근이 막힌 환경에서 작성했다. 요청 필드(order_name, order_amount, return_url)는
 * 공개 문서 요약으로 확인했고, 응답 필드(confirmation_url, 결제 목록)는 여러 이름을 함께 받아들이도록 방어적으로 읽는다.
 * 출시 전 카페24 테스트 쇼핑몰에서 결제 1회를 꼭 확인할 것 (README "결제 켜기" 참고).
 */
import { adminApi } from "./cafe24";
import { query } from "./db";
import { env } from "./env";
import { BRAND } from "./brand";

const PRO_DAYS = 31;

export async function createUpgradeOrder(mallId: string): Promise<string> {
  const json = await adminApi<Record<string, unknown>>(mallId, "POST", "/api/v2/admin/appstore/orders", {
    shop_no: 1,
    request: {
      order_name: `${BRAND.name} Pro 1개월`,
      order_amount: String(env.proPriceKrw),
      return_url: `${env.appUrl}/api/billing/return`,
      automatic_payment: "F",
    },
  });
  const order = (json.order || json) as Record<string, unknown>;
  const orderId = String(order.order_id ?? "");
  const confirmUrl = String(order.confirmation_url ?? order.payment_url ?? "");
  if (!orderId || !confirmUrl.startsWith("http")) throw new Error("카페24 결제 주문 생성 응답을 해석하지 못했습니다.");
  await query(
    `INSERT INTO billing_orders (order_id, mall_id, amount) VALUES ($1, $2, $3) ON CONFLICT (order_id) DO NOTHING`,
    [orderId, mallId, env.proPriceKrw]
  );
  return confirmUrl;
}

/** 결제 완료 여부 확인. 확인되면 Pro 기간을 연장한다. */
export async function confirmUpgrade(mallId: string, orderId: string): Promise<boolean> {
  const pending = await query<{ status: string }>(`SELECT status FROM billing_orders WHERE order_id = $1 AND mall_id = $2`, [orderId, mallId]);
  if (!pending[0]) return false;
  if (pending[0].status === "paid") return true;
  const json = await adminApi<Record<string, unknown>>(
    mallId,
    "GET",
    `/api/v2/admin/appstore/payments?order_id=${encodeURIComponent(orderId)}`
  );
  const payments = (json.payments || []) as Record<string, unknown>[];
  const paid = payments.some((p) => String(p.order_id) === orderId && String(p.refund_status ?? "").toUpperCase() !== "T");
  if (!paid) return false;
  await query(`UPDATE billing_orders SET status = 'paid' WHERE order_id = $1`, [orderId]);
  await query(
    `UPDATE malls SET plan = 'pro',
       plan_expires_at = GREATEST(COALESCE(plan_expires_at, now()), now()) + ($2 || ' days')::interval,
       updated_at = now()
     WHERE mall_id = $1`,
    [mallId, String(PRO_DAYS)]
  );
  return true;
}
