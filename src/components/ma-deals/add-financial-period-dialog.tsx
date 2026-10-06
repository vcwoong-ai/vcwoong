"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  onReload,
}: {
  maDealId: string;
  onCreated: () => void | boolean | Promise<void | boolean>;
  onReload: () => void | boolean | Promise<void | boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [outcomeUnknown, setOutcomeUnknown] = useState(false);
  const pendingRef = useRef(false);
  const requestControllerRef = useRef<AbortController | null>(null);
  const saveConfirmedRef = useRef(false);
  const sessionEpochRef = useRef(0);
  const cancelSaveRequest = useCallback(() => {
    sessionEpochRef.current++;
    requestControllerRef.current?.abort();
    requestControllerRef.current = null;
    pendingRef.current = false;
  }, []);
  useEffect(() => {
    setLoading(false);
    setSaveError(null);
    setOutcomeUnknown(false);
    setOpen(false);
    return cancelSaveRequest;
  }, [maDealId, cancelSaveRequest]);
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
    if (pendingRef.current || outcomeUnknown) return;
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

    pendingRef.current = true;
    const controller = new AbortController();
    const epoch = sessionEpochRef.current;
    requestControllerRef.current = controller;
    saveConfirmedRef.current = false;
    const isCurrent = () => !controller.signal.aborted && epoch === sessionEpochRef.current;
    setLoading(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/ma-deals/${maDealId}/financials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          fiscalYear: parseInt(data.fiscalYear, 10),
          periodType: data.periodType,
          startDate: data.startDate,
          endDate: data.endDate,
          currency: data.currency,
          lineItems,
        }),
      });
      if (!isCurrent()) return;
      if (!res.ok) {
        if (res.status >= 500) {
          setOutcomeUnknown(true);
          setSaveError("저장 결과를 확인하지 못했습니다. 같은 내용을 다시 저장하지 말고 재무 목록에서 결과를 확인하세요.");
        } else {
          setSaveError(res.status === 409
            ? "같은 연도와 기간 유형의 재무 데이터가 이미 있습니다. 재무 목록에서 확인하세요."
            : res.status === 401 ? "로그인이 만료되었습니다. 다시 로그인한 뒤 재무 목록을 확인하세요."
            : res.status === 403 ? "재무 데이터를 저장할 권한이 없습니다."
            : "재무 데이터를 저장하지 못했습니다. 입력값과 재무 목록을 확인하세요.");
        }
        return;
      }
      const json = await res.json();
      if (!isCurrent()) return;
      if (!json.data || typeof json.data.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(json.data.id)) {
        setOutcomeUnknown(true);
        setSaveError("저장 결과를 확인하지 못했습니다. 같은 내용을 다시 저장하지 말고 재무 목록에서 결과를 확인하세요.");
        return;
      }
      saveConfirmedRef.current = true;
      toast.success("재무 기간을 추가했습니다");
      setOpen(false);
      reset();
      // The POST succeeded. A failed subsequent read must not be labelled a failed save.
      try {
        const refreshed = await onCreated();
        if (isCurrent() && refreshed === false)
          toast.error("저장 완료 · 목록 조회 필요", { description: "재무 데이터는 저장되었습니다. 재무 목록만 다시 조회해 주세요." });
      } catch {
        if (isCurrent()) toast.error("저장 완료 · 목록 조회 필요", { description: "재무 데이터는 저장되었습니다. 재무 목록만 다시 조회해 주세요." });
      }
    } catch {
      if (!isCurrent()) return;
      setOutcomeUnknown(true);
      setSaveError("저장 결과를 확인하지 못했습니다. 같은 내용을 다시 저장하지 말고 재무 목록에서 결과를 확인하세요.");
    } finally {
      if (isCurrent()) {
        pendingRef.current = false;
        requestControllerRef.current = null;
        setLoading(false);
      }
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      if (pendingRef.current && requestControllerRef.current && !saveConfirmedRef.current) {
        setOutcomeUnknown(true);
        setSaveError("저장 결과를 확인하지 못했습니다. 같은 내용을 다시 저장하지 말고 재무 목록에서 결과를 확인하세요.");
      }
      cancelSaveRequest();
      setLoading(false);
    }
    setOpen(nextOpen);
  };

  const verifySaveResult = async () => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    const epoch = sessionEpochRef.current;
    setLoading(true);
    try { await onReload(); }
    catch {
      if (epoch === sessionEpochRef.current) setSaveError("재무 목록을 조회하지 못했습니다. 저장 여부는 아직 확인하지 못했습니다. 목록에서 확인하세요.");
    } finally {
      if (epoch === sessionEpochRef.current) { pendingRef.current = false; setLoading(false); }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
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
          {saveError && <div role="alert" data-testid="pe-financial-save-error" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p>{saveError}</p>
            <Button type="button" variant="outline" size="sm" onClick={verifySaveResult} disabled={loading}>저장 결과 조회</Button>
          </div>}
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
            <Button type="button" variant="outline" className="flex-1" onClick={() => handleOpenChange(false)}>
              취소
            </Button>
            <Button type="submit" className="flex-1" disabled={loading || outcomeUnknown}>
              {loading ? "저장 중..." : "저장"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
