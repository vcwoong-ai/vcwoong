"use client";

import Link from "next/link";
import { ArrowRight, Archive, Loader2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MaDealType, MaDealStatus } from "@prisma/client";
import { MA_DEAL_TYPE_LABEL, PE_DECISION_DOMAIN_LABEL, PE_IC_REVIEW_SIGNOFF_STATUS_LABEL } from "@/lib/pe/ma-deal-labels";
import { ReadinessBadge } from "./readiness-badge";
import type { MaDealListReadinessSummary } from "@/lib/pe/ma-deal-list-readiness";

interface MaDealCardProps {
  deal: {
    id: string;
    name: string;
    companyName: string;
    dealType: MaDealType;
    status: MaDealStatus;
    teamId: string | null;
    updatedAt: string;
  };
  /** page.tsx/ma-deals-page-client.tsx가 배치 조회해 온 canonical readiness
   * 요약(ma-deal-list-readiness.ts) — 이 카드는 값을 재계산하지 않는다.
   * 아직 로딩 전이면 undefined일 수 있다. */
  readiness?: MaDealListReadinessSummary;
  /** 제공되면 보관 버튼이 뜬다 — 소유자에게만 넘겨줄 것(API도 소유자만 허용) */
  onArchive?: () => void;
  archiving?: boolean;
}

const DOMAIN_ROWS: Array<{ key: "financial" | "qoe" | "lbo" | "dd"; label: string }> = [
  { key: "financial", label: PE_DECISION_DOMAIN_LABEL.FINANCIAL },
  { key: "qoe", label: PE_DECISION_DOMAIN_LABEL.QOE },
  { key: "lbo", label: PE_DECISION_DOMAIN_LABEL.LBO },
  { key: "dd", label: PE_DECISION_DOMAIN_LABEL.DD },
];

function formatUpdatedAt(iso: string): string {
  return new Date(iso).toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

export function MaDealCard({ deal, readiness, onArchive, archiving }: MaDealCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow duration-200 group">
      <CardContent className="pt-5 space-y-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-xs">
            {MA_DEAL_TYPE_LABEL[deal.dealType]}
          </Badge>
          {deal.status === "ARCHIVED" && (
            <Badge variant="secondary" className="text-xs">
              보관됨
            </Badge>
          )}
          {deal.teamId && (
            <Badge variant="secondary" className="text-xs">
              팀 공유
            </Badge>
          )}
          {readiness && (
            <ReadinessBadge state={readiness.overall} className="ml-auto shrink-0" />
          )}
        </div>

        <div>
          <h3 className="font-semibold text-gray-900 truncate">{deal.companyName}</h3>
          <p className="text-sm text-gray-500 truncate">{deal.name}</p>
        </div>

        {readiness ? (
          <div className="space-y-2">
            <div className="grid grid-cols-4 gap-1.5">
              {DOMAIN_ROWS.map((row) => (
                <div key={row.key} className="min-w-0 text-center">
                  <p className="text-xs text-slate-500 truncate">{row.label}</p>
                  <ReadinessBadge state={readiness[row.key]} compact className="w-full justify-center px-1" />
                </div>
              ))}
            </div>

            {readiness.blockerCount > 0 && (
              <p className="text-xs text-red-600 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                차단 요인 {readiness.blockerCount}건
              </p>
            )}

            <div className="flex items-center justify-between gap-2 text-xs text-gray-400 flex-wrap">
              <span>
                내 검토:{" "}
                <span className="text-gray-600 font-medium">
                  {readiness.myReviewStatus ? PE_IC_REVIEW_SIGNOFF_STATUS_LABEL[readiness.myReviewStatus] : "미검토"}
                </span>
              </span>
              <span>{formatUpdatedAt(deal.updatedAt)} 수정</span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-gray-400">준비 상태 불러오는 중...</p>
        )}
      </CardContent>

      <CardFooter className="pt-0 pb-4">
        <div className="flex gap-2 w-full">
          <Link href={`/ma-deals/${deal.id}`} className="flex-1">
            <Button
              variant="outline"
              size="sm"
              className="w-full group-hover:border-blue-300"
            >
              상세 보기
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
          {onArchive && deal.status === "ACTIVE" && (
            <Button
              variant="outline"
              size="sm"
              className="text-gray-500 border-gray-200 hover:bg-gray-50"
              onClick={(e) => {
                e.preventDefault();
                onArchive();
              }}
              disabled={archiving}
              title="딜 보관"
            >
              {archiving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Archive className="w-3.5 h-3.5" />
              )}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
