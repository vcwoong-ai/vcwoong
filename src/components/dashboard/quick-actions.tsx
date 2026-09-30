"use client";

import Link from "next/link";
import { FileText, LayoutTemplate, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CreateDealDialog } from "@/components/deals/create-deal-dialog";
import { CreateMaDealDialog } from "@/components/ma-deals/create-ma-deal-dialog";

/**
 * 대시보드 상단 액션 — 타일 4개(아이콘이 제목보다 큼) 대신, 실제로 시작할 수 있는 일을 한 줄로.
 * 딜 만들기는 VC / PE 두 트랙을 나란히 둔다(같은 등록 다이얼로그를 그대로 쓴다).
 */
export function DashboardQuickActions() {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="dashboard-actions">
      <CreateDealDialog
        trigger={
          <Button size="sm">
            <Plus /> VC 딜 등록
          </Button>
        }
      />
      <CreateMaDealDialog
        trigger={
          <Button size="sm" variant="outline">
            <Plus /> PE/M&A 딜 등록
          </Button>
        }
      />
      <Button size="sm" variant="ghost" asChild>
        <Link href="/reports/new">
          <FileText /> 보고서 생성
        </Link>
      </Button>
      <Button size="sm" variant="ghost" asChild>
        <Link href="/templates">
          <LayoutTemplate /> 양식 관리
        </Link>
      </Button>
    </div>
  );
}
