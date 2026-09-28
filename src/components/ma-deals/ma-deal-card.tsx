"use client";

import Link from "next/link";
import { ArrowRight, Archive, Loader2 } from "lucide-react";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MaDealType, MaDealStatus } from "@prisma/client";
import { MA_DEAL_TYPE_LABEL } from "@/lib/pe/ma-deal-labels";

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
  /** 제공되면 보관 버튼이 뜬다 — 소유자에게만 넘겨줄 것(API도 소유자만 허용) */
  onArchive?: () => void;
  archiving?: boolean;
}

export function MaDealCard({ deal, onArchive, archiving }: MaDealCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow duration-200 group">
      <CardContent className="pt-5">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
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
        </div>
        <h3 className="font-semibold text-gray-900 truncate">
          {deal.companyName}
        </h3>
        <p className="text-sm text-gray-500 truncate">{deal.name}</p>
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
