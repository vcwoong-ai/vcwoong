import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import type { computeLboEntryEbitda } from "@/lib/pe/ma-deal-dashboard";

type LboEntryEbitdaResult = ReturnType<typeof computeLboEntryEbitda>;

/**
 * IC 스냅샷 — MOIC/IRR을 여기서 지어내지 않는다. LBO는 배수·레버리지·
 * 보유기간 같은 가정이 필요한데 이 가정들은 딜마다 사람이 판단하는
 * 영역이라(도메인에 영속화도 안 돼 있음) 임의 기본값을 IC 앞에 "이
 * 딜의 결과"인 것처럼 보여주면 안 된다(§4/§9/§10 요구사항). 대신 실제
 * 재무·QoE(승인된 조정만)에서 나온 Entry EBITDA만 근거와 함께 보여주고,
 * MOIC/IRR은 LBO 탭에서 사람이 가정을 입력해 직접 확인하도록 안내한다.
 */
export function MaDealIcSnapshot({
  lboEntryEbitda,
  onOpenLbo,
}: {
  lboEntryEbitda: LboEntryEbitdaResult;
  onOpenLbo: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">LBO Entry EBITDA</CardTitle>
        <Button size="sm" onClick={onOpenLbo}>
          LBO 시뮬레이션 열기
          <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
        </Button>
      </CardHeader>
      <CardContent>
        {lboEntryEbitda.status === "ok" ? (
          <div className="space-y-1">
            <p className="text-2xl font-semibold text-primary">
              {lboEntryEbitda.lbo.entryEbitdaInEok.toLocaleString(undefined, { maximumFractionDigits: 1 })}
              억원
            </p>
            <p className="text-xs text-gray-400">
              {lboEntryEbitda.provenance.fiscalPeriod} QoE 승인된 조정 반영(Adjusted EBITDA) 기준 ·
              Reported {(lboEntryEbitda.provenance.baseEbitdaKrw / 100_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}억원
              {lboEntryEbitda.provenance.approvedAdjustmentTotalKrw !== 0 &&
                ` ${lboEntryEbitda.provenance.approvedAdjustmentTotalKrw > 0 ? "+" : ""}${(lboEntryEbitda.provenance.approvedAdjustmentTotalKrw / 100_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}억원 조정`}
            </p>
            <p className="text-xs text-gray-400">
              진입 배수·레버리지·Exit 배수 등 나머지 가정은 딜별 판단이 필요해 자동 계산하지 않습니다 — LBO 탭에서 직접 입력하세요.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            <p className="text-sm text-amber-600">
              {lboEntryEbitda.status === "no_period" && "등록된 재무 데이터가 없어 Entry EBITDA를 계산할 수 없습니다."}
              {lboEntryEbitda.status === "missing_input" && "최근 재무기간에서 EBITDA 계정을 찾을 수 없습니다."}
              {lboEntryEbitda.status === "invalid_qoe_result" && "QoE 계산 결과가 유효하지 않습니다(" + lboEntryEbitda.detail + ")."}
              {lboEntryEbitda.status === "unsupported_currency" && `현재 KRW만 지원합니다(재무기간 통화: ${lboEntryEbitda.currency}).`}
              {lboEntryEbitda.status === "invalid_period" && "재무기간 정보가 유효하지 않습니다."}
            </p>
            <p className="text-xs text-gray-400">계산 불가 — 재무 · QoE 탭에서 데이터를 먼저 입력하세요.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
