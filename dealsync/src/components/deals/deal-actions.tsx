"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { DEAL_STATUSES } from "@/lib/utils";
import { Settings, Trash2 } from "lucide-react";

interface DealActionsProps {
  dealId: string;
  currentStatus: string;
}

export function DealActions({ dealId, currentStatus }: DealActionsProps) {
  const router = useRouter();
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [newStatus, setNewStatus] = useState(currentStatus);

  const handleStatusChange = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error();

      toast({ title: "상태가 업데이트되었습니다", variant: "default" });
      setIsStatusOpen(false);
      router.refresh();
    } catch {
      toast({ title: "오류가 발생했습니다", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/deals/${dealId}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error();

      toast({ title: "딜이 삭제되었습니다" });
      router.push("/deals");
    } catch {
      toast({ title: "삭제 중 오류가 발생했습니다", variant: "destructive" });
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {/* Status Change */}
      <Dialog open={isStatusOpen} onOpenChange={setIsStatusOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <Settings className="w-3.5 h-3.5" />
            상태 변경
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>딜 상태 변경</DialogTitle>
            <DialogDescription>이 딜의 진행 상태를 변경합니다.</DialogDescription>
          </DialogHeader>
          <Select value={newStatus} onValueChange={setNewStatus}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(DEAL_STATUSES).map(([key, { label }]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatusOpen(false)}>취소</Button>
            <Button onClick={handleStatusChange} disabled={isLoading}>
              {isLoading ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <Dialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" className="text-red-500 hover:text-red-600 hover:border-red-200">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>딜 삭제</DialogTitle>
            <DialogDescription>
              이 딜과 관련된 모든 데이터(보고서 포함)가 영구적으로 삭제됩니다. 계속하시겠습니까?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteOpen(false)}>취소</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isLoading}>
              {isLoading ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
