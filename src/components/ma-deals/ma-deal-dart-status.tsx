import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { DartStatusView } from "@/lib/pe/ma-deal-dashboard";

export function MaDealDartStatus({
  dart,
  onOpenDart,
}: {
  dart: DartStatusView;
  onOpenDart: () => void;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">DART 공시 검증</CardTitle>
        <Button variant="ghost" size="sm" onClick={onOpenDart}>
          DART 탭 열기
        </Button>
      </CardHeader>
      <CardContent className="flex items-center gap-3 text-sm">
        <Badge variant={dart.imported ? "default" : "secondary"}>
          {dart.imported ? "연동됨" : "미연동"}
        </Badge>
        {dart.imported ? (
          <span className="text-gray-500">
            {dart.periodsCount}개 기간 · 최근 회계연도 FY{dart.latestFiscalYear}
          </span>
        ) : (
          <span className="text-gray-400">DART 공시 데이터를 아직 가져오지 않았습니다</span>
        )}
      </CardContent>
    </Card>
  );
}
