import { PricingClient } from "./pricing-client";
import { BRAND } from "@/lib/brand";

export const metadata = {
  title: `가격 — ${BRAND.name}`,
  description:
    "Axiom 요금제. 무료로 시작하고, 필요할 때 섹터·양식·LP 리포팅을 확장하세요. 연간 결제 시 2개월 무료.",
};

export default function PricingPage() {
  return <PricingClient />;
}
