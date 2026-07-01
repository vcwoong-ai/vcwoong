"use client";

import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Plus, FileText, LayoutTemplate, Briefcase } from "lucide-react";
import { CreateDealDialog } from "@/components/deals/create-deal-dialog";

export function DashboardQuickActions() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <CreateDealDialog
        trigger={
          <Card className="cursor-pointer hover:shadow-md hover:border-blue-200 transition-all h-full">
            <CardContent className="pt-5 pb-4 flex flex-col items-center text-center gap-2">
              <div className="p-2.5 rounded-xl bg-blue-50">
                <Plus className="w-5 h-5 text-blue-600" />
              </div>
              <span className="text-sm font-medium text-gray-900">새 딜 등록</span>
            </CardContent>
          </Card>
        }
      />
      <Link href="/reports/new">
        <Card className="hover:shadow-md hover:border-purple-200 transition-all h-full">
          <CardContent className="pt-5 pb-4 flex flex-col items-center text-center gap-2">
            <div className="p-2.5 rounded-xl bg-purple-50">
              <FileText className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-sm font-medium text-gray-900">보고서 생성</span>
          </CardContent>
        </Card>
      </Link>
      <Link href="/templates">
        <Card className="hover:shadow-md hover:border-emerald-200 transition-all h-full">
          <CardContent className="pt-5 pb-4 flex flex-col items-center text-center gap-2">
            <div className="p-2.5 rounded-xl bg-emerald-50">
              <LayoutTemplate className="w-5 h-5 text-emerald-600" />
            </div>
            <span className="text-sm font-medium text-gray-900">양식 등록</span>
          </CardContent>
        </Card>
      </Link>
      <Link href="/deals">
        <Card className="hover:shadow-md hover:border-amber-200 transition-all h-full">
          <CardContent className="pt-5 pb-4 flex flex-col items-center text-center gap-2">
            <div className="p-2.5 rounded-xl bg-amber-50">
              <Briefcase className="w-5 h-5 text-amber-600" />
            </div>
            <span className="text-sm font-medium text-gray-900">딜 관리</span>
          </CardContent>
        </Card>
      </Link>
    </div>
  );
}
