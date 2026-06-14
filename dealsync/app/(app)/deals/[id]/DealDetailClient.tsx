"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Building2,
  Upload,
  FileText,
  ChevronDown,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import DocumentsTab from "./DocumentsTab";
import ReportTab from "./ReportTab";

const stageColors: Record<string, string> = {
  검토중: "bg-blue-100 text-blue-700",
  심층심사: "bg-amber-100 text-amber-700",
  투심: "bg-purple-100 text-purple-700",
  투자완료: "bg-green-100 text-green-700",
};

const STATUSES = ["검토중", "심층심사", "투심", "투자완료"];

export default function DealDetailClient({ deal }: { deal: any }) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState(deal.status);

  const updateStatus = async (newStatus: string) => {
    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setCurrentStatus(newStatus);
        toast.success(`상태가 '${newStatus}'로 변경되었습니다.`);
      }
    } catch {
      toast.error("상태 변경에 실패했습니다.");
    }
  };

  const deleteDeal = async () => {
    if (!confirm(`'${deal.companyName}' 딜을 삭제하시겠습니까?`)) return;
    try {
      await fetch(`/api/deals/${deal.id}`, { method: "DELETE" });
      toast.success("딜이 삭제되었습니다.");
      router.push("/deals");
    } catch {
      toast.error("삭제에 실패했습니다.");
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-border">
        <div className="flex items-center gap-3">
          <Link href="/deals">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              딜 목록
            </Button>
          </Link>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
              <Building2 className="w-4 h-4 text-[#1B4FD8]" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{deal.companyName}</h1>
              <div className="flex items-center gap-2">
                {deal.sector && (
                  <span className="text-xs text-muted-foreground">{deal.sector}</span>
                )}
                {deal.stage && (
                  <>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">{deal.stage}</span>
                  </>
                )}
                {deal.amount && (
                  <>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground">
                      {(deal.amount / 1e8).toFixed(1)}억원
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors">
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stageColors[currentStatus]}`}>
                {currentStatus}
              </span>
              <ChevronDown className="w-3.5 h-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {STATUSES.map((s) => (
                <DropdownMenuItem
                  key={s}
                  onClick={() => updateStatus(s)}
                  className={s === currentStatus ? "font-semibold" : ""}
                >
                  {s}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="ghost"
            size="sm"
            onClick={deleteDeal}
            className="text-red-500 hover:text-red-600 hover:bg-red-50"
          >
            삭제
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-auto">
        <Tabs defaultValue="documents" className="h-full flex flex-col">
          <div className="bg-white border-b border-border px-6">
            <TabsList className="h-auto bg-transparent p-0 gap-0">
              <TabsTrigger
                value="documents"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#1B4FD8] data-[state=active]:text-[#1B4FD8] data-[state=active]:bg-transparent pb-3 pt-2 px-4 gap-2"
              >
                <Upload className="w-4 h-4" />
                문서 ({deal.documents?.length || 0})
              </TabsTrigger>
              <TabsTrigger
                value="report"
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-[#1B4FD8] data-[state=active]:text-[#1B4FD8] data-[state=active]:bg-transparent pb-3 pt-2 px-4 gap-2"
              >
                <FileText className="w-4 h-4" />
                보고서 ({deal.reports?.length || 0})
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="documents" className="flex-1 m-0 p-6 overflow-auto">
            <DocumentsTab dealId={deal.id} initialDocuments={deal.documents || []} />
          </TabsContent>

          <TabsContent value="report" className="flex-1 m-0 p-6 overflow-auto">
            <ReportTab dealId={deal.id} reports={deal.reports || []} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
