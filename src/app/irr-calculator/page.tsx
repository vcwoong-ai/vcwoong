import { BRAND } from "@/lib/brand";
import { IrrCalculatorClient } from "./irr-calculator-client";

export const metadata = {
  title: `무료 IRR 계산기 — ${BRAND.name}`,
  description:
    "투자금과 예상 회수금만 입력하면 IRR(내부수익률)과 투자 배수를 즉시 계산합니다. 로그인 없이 무료로 사용할 수 있습니다.",
};

export default function IrrCalculatorPage() {
  return <IrrCalculatorClient />;
}
