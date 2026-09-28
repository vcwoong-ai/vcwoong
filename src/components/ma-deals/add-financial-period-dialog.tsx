"use client";

import { useState } from "react";
import { useForm, useFieldArray } from "react-hook-form";
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
import { Plus, Trash2 } from "lucide-react";
import { CANONICAL_LINE_ITEMS, LINE_ITEM_STATEMENT_TYPE, type CanonicalLineItem } from "@/lib/pe/financial-types";
import { useToast } from "@/hooks/use-toast";

interface LineItemRow {
  lineItem: CanonicalLineItem;
  value: string;
}

interface FormData {
  fiscalYear: string;
  periodType: "ANNUAL" | "QUARTERLY" | "TTM";
  startDate: string;
  endDate: string;
  currency: string;
  lineItems: LineItemRow[];
}

/** 원 단위 원본 금액 입력 — 사용자는 억원으로 입력하고 여기서 곱해 저장한다
 * (financial-types.ts의 "value는 최소 표시 단위 원본 금액" 규약을 그대로 지킴). */
const EOKWON = 100_000_000;

export function AddFinancialPeriodDialog({
  maDealId,
  onCreated,
}: {
  maDealId: string;
  onCreated: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const { register, control, handleSubmit, reset, setValue } = useForm<FormData>({
    defaultValues: {
      fiscalYear: String(new Date().getFullYear()),
      periodType: "ANNUAL",
      startDate: `${new Date().getFullYear()}-01-01`,
      endDate: `${new Date().getFullYear()}-12-31`,
      currency: "KRW",
      lineItems: [{ lineItem: "REVENUE", value: "" }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "lineItems" });

  const onSubmit = async (data: FormData) => {
    const lineItems = data.lineItems
      .filter((li) => li.value.trim() !== "")
      .map((li) => ({
        statementType: LINE_ITEM_STATEMENT_TYPE[li.lineItem],
        lineItem: li.lineItem,
        value: Math.round(parseFloat(li.value) * EOKWON),
        currency: data.currency,
        source: "MANUAL" as const,
      }));

    if (lineItems.length === 0) {
      toast.error("최소 1개 계정값을 입력해주세요");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`/api/ma-deals/${maDealId}/financials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fiscalYear: parseInt(data.fiscalYear, 10),
          periodType: data.periodType,
          startDate: data.startDate,
          endDate: data.endDate,
          currency: data.currency,
          lineItems,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "재무 데이터 생성 실패");
      }
      toast.success("재무 기간을 추가했습니다");
      setOpen(false);
      reset();
      await onCreated();
    } catch (e) {
      toast.error("재무 데이터 생성 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="w-4 h-4 mr-1.5" />
          재무 기간 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[560px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>재무 기간 추가</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-2">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>회계연도</Label>
              <Input type="number" {...register("fiscalYear")} />
            </div>
            <div className="space-y-1.5">
              <Label>기간 유형</Label>
              <Select
                defaultValue="ANNUAL"
                onValueChange={(val) => setValue("periodType", val as FormData["periodType"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ANNUAL">연간</SelectItem>
                  <SelectItem value="QUARTERLY">분기</SelectItem>
                  <SelectItem value="TTM">TTM</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>시작일</Label>
              <Input type="date" {...register("startDate")} />
            </div>
            <div className="space-y-1.5">
              <Label>종료일</Label>
              <Input type="date" {...register("endDate")} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>통화</Label>
            <Input {...register("currency")} placeholder="KRW" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>계정과목 (억원 단위)</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ lineItem: "REVENUE", value: "" })}
              >
                <Plus className="w-3.5 h-3.5 mr-1" />행 추가
              </Button>
            </div>
            {fields.map((field, index) => (
              <div key={field.id} className="flex items-center gap-2">
                <Select
                  defaultValue={field.lineItem}
                  onValueChange={(val) =>
                    setValue(`lineItems.${index}.lineItem`, val as CanonicalLineItem)
                  }
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CANONICAL_LINE_ITEMS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="값"
                  className="w-28"
                  {...register(`lineItems.${index}.value` as const)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                >
                  <Trash2 className="w-3.5 h-3.5 text-gray-400" />
                </Button>
              </div>
            ))}
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit" className="flex-1" disabled={loading}>
              {loading ? "저장 중..." : "저장"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
