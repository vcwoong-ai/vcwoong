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
  DialogDescription,
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
import { Plus } from "lucide-react";
import { MaDealType } from "@prisma/client";
import { MA_DEAL_TYPE_LABEL } from "@/lib/pe/ma-deal-labels";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(1, "딜 이름을 입력해주세요"),
  companyName: z.string().min(1, "기업명을 입력해주세요"),
  dealType: z.nativeEnum(MaDealType),
});

type FormData = z.infer<typeof formSchema>;

const DEAL_TYPE_OPTIONS = Object.values(MaDealType).map((value) => ({
  value,
  label: MA_DEAL_TYPE_LABEL[value],
}));

export function CreateMaDealDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const response = await fetch("/api/ma-deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "PE 딜 생성 실패");
      }

      const result = await response.json();
      setOpen(false);
      reset();
      router.push(`/ma-deals/${result.data.id}`);
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("PE 딜 생성 실패", {
        description: error instanceof Error ? error.message : "다시 시도해 주세요",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button>
            <Plus className="w-4 h-4 mr-2" />새 PE 딜 등록
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>새 PE/M&A 딜 등록</DialogTitle>
          <DialogDescription>회사명, 딜 이름, 거래 유형을 입력하세요. 재무 정보는 딜을 만든 뒤 입력할 수 있습니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label htmlFor="companyName">대상 기업명 *</Label>
            <Input
              id="companyName"
              placeholder="예: (주)타겟컴퍼니"
              {...register("companyName")}
            />
            {errors.companyName && (
              <p className="text-xs text-red-500">{errors.companyName.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">딜 이름 *</Label>
            <Input
              id="name"
              placeholder="예: 타겟컴퍼니 바이아웃 검토"
              {...register("name")}
            />
            {errors.name && (
              <p className="text-xs text-red-500">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dealType">딜 유형 *</Label>
            <Select
              onValueChange={(val) => setValue("dealType", val as MaDealType)}
            >
              <SelectTrigger>
                <SelectValue placeholder="딜 유형 선택" />
              </SelectTrigger>
              <SelectContent>
                {DEAL_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.dealType && (
              <p className="text-xs text-red-500">{errors.dealType.message}</p>
            )}
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setOpen(false)}
            >
              취소
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "등록 중..." : "딜 등록"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
