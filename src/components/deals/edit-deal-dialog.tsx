"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Settings2, Loader2, Trash2 } from "lucide-react";
import { DealSector, DealStage } from "@prisma/client";

const formSchema = z.object({
  name: z.string().min(1),
  companyName: z.string().min(1),
  sector: z.nativeEnum(DealSector),
  stage: z.nativeEnum(DealStage),
  investRound: z.string().optional(),
  investAmount: z.string().optional(),
  valuation: z.string().optional(),
  description: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface EditDealDialogProps {
  deal: {
    id: string;
    name: string;
    companyName: string;
    sector: DealSector;
    stage: DealStage;
    investRound: string | null;
    investAmount: number | null;
    valuation: number | null;
    description: string | null;
  };
}

const SECTOR_OPTIONS = [
  { value: DealSector.BIO, label: "🧬 바이오/헬스케어" },
  { value: DealSector.IT, label: "💻 IT/SaaS" },
  { value: DealSector.DEEPTECH, label: "🤖 AI/딥테크" },
  { value: DealSector.MANUFACTURING, label: "🏭 제조/하드웨어" },
  { value: DealSector.CONTENT, label: "🎬 콘텐츠/엔터" },
  { value: DealSector.FINTECH, label: "💳 핀테크/금융" },
  { value: DealSector.CONSUMER, label: "🛍️ 소비재" },
  { value: DealSector.CLIMATE, label: "🌿 기후/ESG" },
  { value: DealSector.GENERAL, label: "📁 일반" },
];

const STAGE_OPTIONS = [
  { value: DealStage.SCREENING, label: "스크리닝" },
  { value: DealStage.DEEP_DIVE, label: "딥다이브" },
  { value: DealStage.IC_PREP, label: "IC 준비" },
  { value: DealStage.IC_REVIEW, label: "IC 심의" },
  { value: DealStage.CLOSED, label: "투자 완료" },
  { value: DealStage.REJECTED, label: "거절" },
];

export function EditDealDialog({ deal }: EditDealDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();

  const { register, handleSubmit, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: deal.name,
      companyName: deal.companyName,
      sector: deal.sector,
      stage: deal.stage,
      investRound: deal.investRound ?? "",
      investAmount: deal.investAmount?.toString() ?? "",
      valuation: deal.valuation?.toString() ?? "",
      description: deal.description ?? "",
    },
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          investAmount: data.investAmount ? parseFloat(data.investAmount) : undefined,
          valuation: data.valuation ? parseFloat(data.valuation) : undefined,
        }),
      });
      if (!res.ok) throw new Error("수정 실패");
      setOpen(false);
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "오류 발생");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(`"${deal.companyName}" 딜을 삭제하시겠습니까? 관련 문서와 보고서도 함께 삭제됩니다.`)) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
      router.push("/deals");
      router.refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : "삭제 오류");
      setDeleting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="w-3.5 h-3.5 mr-1.5" />
          딜 편집
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <DialogTitle>딜 편집</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>기업명 *</Label>
              <Input {...register("companyName")} />
              {errors.companyName && <p className="text-xs text-red-500">{errors.companyName.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>섹터 *</Label>
              <Select defaultValue={deal.sector} onValueChange={(v) => setValue("sector", v as DealSector)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SECTOR_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>딜 이름 *</Label>
            <Input {...register("name")} />
          </div>

          <div className="space-y-1.5">
            <Label>투자 단계</Label>
            <Select defaultValue={deal.stage} onValueChange={(v) => setValue("stage", v as DealStage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAGE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label>투자 라운드</Label>
              <Input {...register("investRound")} placeholder="Series A" />
            </div>
            <div className="space-y-1.5">
              <Label>투자금액 (억원)</Label>
              <Input type="number" {...register("investAmount")} />
            </div>
            <div className="space-y-1.5">
              <Label>Post 밸류 (억원)</Label>
              <Input type="number" {...register("valuation")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>메모</Label>
            <Textarea rows={3} {...register("description")} />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="text-red-500 hover:text-red-700 hover:border-red-300"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            </Button>
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              저장
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
