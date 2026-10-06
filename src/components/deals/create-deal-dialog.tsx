"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
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
import { Textarea } from "@/components/ui/textarea";
import { Plus } from "lucide-react";
import { DealSector } from "@prisma/client";
import { useToast } from "@/hooks/use-toast";

const formSchema = z.object({
  name: z.string().min(1, "딜 이름을 입력해주세요"),
  companyName: z.string().min(1, "기업명을 입력해주세요"),
  sector: z.nativeEnum(DealSector, { message: "섹터를 선택해주세요" }),
  investRound: z.string().optional(),
  investAmount: z.string().optional(),
  valuation: z.string().optional(),
  description: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

const SECTOR_OPTIONS = [
  { value: DealSector.BIO,           label: "🧬 바이오/헬스케어"  },
  { value: DealSector.IT,            label: "💻 IT/SaaS"          },
  { value: DealSector.DEEPTECH,      label: "🤖 AI/딥테크"        },
  { value: DealSector.MANUFACTURING, label: "🏭 제조/하드웨어"    },
  { value: DealSector.CONTENT,       label: "🎬 콘텐츠/엔터"      },
  { value: DealSector.FINTECH,       label: "💳 핀테크/금융"      },
  { value: DealSector.CONSUMER,      label: "🛍️ 소비재"           },
  { value: DealSector.CLIMATE,       label: "🌿 기후/ESG"         },
  { value: DealSector.GENERAL,       label: "📁 일반"             },
];

export function CreateDealDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
    reset,
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const response = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...data,
          investAmount: data.investAmount
            ? parseFloat(data.investAmount)
            : undefined,
          valuation: data.valuation ? parseFloat(data.valuation) : undefined,
        }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error ?? "딜 생성 실패");
      }

      const result = await response.json();
      setOpen(false);
      reset();
      router.push(`/deals/${result.data.id}`);
      router.refresh();
    } catch (error) {
      console.error(error);
      toast.error("딜 생성 실패", {
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
            <Plus className="w-4 h-4 mr-2" />새 딜 등록
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>새 투자 딜 등록</DialogTitle>
          <DialogDescription>회사명, 딜 이름, 섹터를 입력하세요. 자료는 딜을 만든 뒤 상세 화면에서 올릴 수 있습니다.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="companyName">기업명 *</Label>
              <Input
                id="companyName"
                placeholder="예: (주)테크스타트업"
                aria-required="true"
                aria-invalid={!!errors.companyName}
                aria-describedby={errors.companyName ? "companyName-error" : undefined}
                {...register("companyName")}
              />
              {errors.companyName && (
                <p id="companyName-error" className="text-xs text-red-500" role="alert">
                  {errors.companyName.message}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sector">섹터 *</Label>
              <Controller name="sector" control={control} render={({ field }) => (
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger id="sector" ref={field.ref} onBlur={field.onBlur}
                  aria-required="true" aria-invalid={!!errors.sector}
                  aria-describedby={errors.sector ? "sector-error" : undefined}>
                  <SelectValue placeholder="섹터 선택" />
                </SelectTrigger>
                <SelectContent>
                  {SECTOR_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              )} />
              {errors.sector && (
                <p id="sector-error" className="text-xs text-red-500" role="alert">{errors.sector.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="name">딜 이름 *</Label>
            <Input
              id="name"
              placeholder="예: 테크스타트업 Series A 투자 검토"
              aria-required="true"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? "name-error" : undefined}
              {...register("name")}
            />
            {errors.name && (
              <p id="name-error" className="text-xs text-red-500" role="alert">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="investRound">투자 라운드</Label>
              <Input
                id="investRound"
                placeholder="Series A"
                {...register("investRound")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="investAmount">투자금액 (억원)</Label>
              <Input
                id="investAmount"
                type="number"
                placeholder="50"
                {...register("investAmount")}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="valuation">Post 밸류 (억원)</Label>
              <Input
                id="valuation"
                type="number"
                placeholder="300"
                {...register("valuation")}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">메모 (선택)</Label>
            <Textarea
              id="description"
              placeholder="딜에 대한 간략한 메모..."
              rows={3}
              {...register("description")}
            />
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
