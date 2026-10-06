/**
 * Credentials alone do not establish safe recurring billing.
 * Local checkout, reconciliation and period tests are prepared. Keep this hold
 * until provider callbacks/retries, recovery policy, operational schema rollout,
 * key backup and actual runtime budgets have been independently verified.
 * Environment variables alone must never activate billing.
 */
export function isSubscriptionCheckoutReady(): boolean {
  return false;
}

export const SUBSCRIPTION_CHECKOUT_NOTICE =
  "유료 구독 결제를 준비하고 있습니다. 현재 무료 플랜을 이용하실 수 있습니다. 도입 문의는 서비스 관리자에게 연락해 주세요.";
