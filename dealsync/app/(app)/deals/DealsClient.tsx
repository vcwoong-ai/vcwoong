"use client";

import { useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Building2,
  Search,
  FileText,
  Upload,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

const stageColors: Record<string, string> = {
  검토중: "bg-blue-100 text-blue-700",
  심층심사: "bg-amber-100 text-amber-700",
  투심: "bg-purple-100 text-purple-700",
  투자완료: "bg-green-100 text-green-700",
};

const sectorColors: Record<string, string> = {
  BIO: "bg-emerald-50 text-emerald-600",
  IT: "bg-sky-50 text-sky-600",
  핀테크: "bg-violet-50 text-violet-600",
  제조: "bg-orange-50 text-orange-600",
  커머스: "bg-pink-50 text-pink-600",
  헬스케어: "bg-teal-50 text-teal-600",
};

export default function DealsClient({ deals }: { deals: any[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const filtered = deals.filter((d) => {
    const matchSearch =
      !search ||
      d.companyName.toLowerCase().includes(search.toLowerCase()) ||
      d.sector?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = !statusFilter || d.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statuses = ["검토중", "심층심사", "투심", "투자완료"];

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="회사명 또는 섹터 검색..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9"
          />
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => setStatusFilter(null)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              !statusFilter ? "bg-[#1B4FD8] text-white" : "bg-white border border-border text-gray-600 hover:bg-gray-50"
            }`}
          >
            전체
          </button>
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s === statusFilter ? null : s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s ? "bg-[#1B4FD8] text-white" : "bg-white border border-border text-gray-600 hover:bg-gray-50"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Deals Grid */}
      {filtered.length === 0 ? (
        <div className="text-center py-20">
          <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-muted-foreground">
            {search || statusFilter ? "검색 결과가 없습니다" : "등록된 딜이 없습니다"}
          </p>
          {!search && !statusFilter && (
            <Link href="/deals/new">
              <Button size="sm" className="mt-3 bg-[#1B4FD8] hover:bg-[#1540B0]">
                첫 딜 추가하기
              </Button>
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((deal) => (
            <Link key={deal.id} href={`/deals/${deal.id}`}>
              <Card className="border border-border hover:border-[#1B4FD8]/40 hover:shadow-md transition-all cursor-pointer group">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-5 h-5 text-gray-500 group-hover:text-[#1B4FD8] transition-colors" />
                    </div>
                    <Badge className={`${stageColors[deal.status]} border-0 text-xs`}>
                      {deal.status}
                    </Badge>
                  </div>

                  <div className="mb-3">
                    <h3 className="font-semibold text-gray-900 group-hover:text-[#1B4FD8] transition-colors">
                      {deal.companyName}
                    </h3>
                    <div className="flex items-center gap-2 mt-1">
                      {deal.sector && (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${sectorColors[deal.sector] || "bg-gray-100 text-gray-500"}`}>
                          {deal.sector}
                        </span>
                      )}
                      {deal.stage && (
                        <span className="text-xs text-muted-foreground">{deal.stage}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <Upload className="w-3 h-3" />
                        {deal._count?.documents || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {deal._count?.reports || 0}
                      </span>
                      {deal.amount && (
                        <span className="flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          {(deal.amount / 1e8).toFixed(1)}억원
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span>
                        {formatDistanceToNow(new Date(deal.createdAt), {
                          addSuffix: true,
                          locale: ko,
                        })}
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#1B4FD8] transition-colors" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
