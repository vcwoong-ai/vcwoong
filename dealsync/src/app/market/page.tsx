import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, ArrowUpRight } from "lucide-react";

const marketData = [
  { sector: "AI/ML", growth: "+42%", size: "₩8.2조", deals: 28, trend: "up" },
  { sector: "핀테크", growth: "+28%", size: "₩5.6조", deals: 22, trend: "up" },
  { sector: "헬스케어", growth: "+35%", size: "₩6.1조", deals: 19, trend: "up" },
  { sector: "SaaS", growth: "+22%", size: "₩4.3조", deals: 31, trend: "up" },
  { sector: "에듀테크", growth: "+15%", size: "₩2.1조", deals: 12, trend: "up" },
  { sector: "커머스", growth: "+8%", size: "₩12.4조", deals: 25, trend: "up" },
];

export default function MarketPage() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">시장 분석</h1>
        <p className="text-gray-500 mt-1 text-sm">주요 섹터별 시장 현황 및 투자 트렌드</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
        {marketData.map((market) => (
          <Card key={market.sector} className="border-gray-100 hover:shadow-md transition-shadow">
            <CardContent className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900">{market.sector}</h3>
                <Badge variant="success" className="text-xs gap-1">
                  <ArrowUpRight className="w-3 h-3" />
                  {market.growth}
                </Badge>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">시장 규모</span>
                  <span className="font-medium">{market.size}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">국내 딜 수 (2024)</span>
                  <span className="font-medium">{market.deals}건</span>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-xs text-gray-500">전년 대비 성장 중</span>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-100 rounded-2xl p-6">
        <h3 className="font-semibold text-blue-900 mb-2">2024 한국 벤처 투자 트렌드</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {[
            { label: "총 투자 금액", value: "₩7.2조", sub: "전년 대비 +18%" },
            { label: "신규 투자 건수", value: "2,841건", sub: "전년 대비 +12%" },
            { label: "평균 투자 단가", value: "₩25.3억", sub: "전년 대비 +5%" },
          ].map((stat) => (
            <div key={stat.label} className="bg-white rounded-xl p-4">
              <div className="text-2xl font-bold text-gray-900">{stat.value}</div>
              <div className="text-sm text-gray-500 mt-0.5">{stat.label}</div>
              <div className="text-xs text-green-600 mt-1">{stat.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
