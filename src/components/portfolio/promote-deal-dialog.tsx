"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PromotableDeal } from "@/app/portfolio/portfolio-page-client";

const NO_FUND = "__none__";

const SECTORS = [
  "BIO",
  "IT",
  "DEEPTECH",
  "MANUFACTURING",
  "CONTENT",
  "FINTECH",
  "CONSUMER",
  "CLIMATE",
  "GENERAL",
] as const;

export function PromoteDealDialog({
  open,
  deals,
  funds,
  onClose,
  onDone,
}: {
  open: boolean;
  deals: PromotableDeal[];
  funds: Array<{ id: string; name: string; vintageYear: number }>;
  onClose: () => void;
  onDone: () => void;
}) {
  const [dealId, setDealId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [sector, setSector] = useState<string>("GENERAL");
  const [investAmount, setInvestAmount] = useState("");
  const [ownershipPercent, setOwnershipPercent] = useState("");
  const [entryValuation, setEntryValuation] = useState("");
  const [investedAt, setInvestedAt] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [fundId, setFundId] = useState<string>(NO_FUND);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setDealId(null);
      setCompanyName("");
      setSector("GENERAL");
      setInvestAmount("");
      setOwnershipPercent("");
      setEntryValuation("");
      setFundId(NO_FUND);
      setError(null);
    }
  }, [open]);

  const selectDeal = (d: PromotableDeal) => {
    setDealId(d.id);
    setCompanyName(d.companyName);
    setSector(d.sector);
    if (d.investAmount != null) setInvestAmount(String(d.investAmount));
    if (d.valuation != null) {
      setEntryValuation(String(d.valuation));
      if (d.investAmount != null && d.valuation > 0) {
        setOwnershipPercent(
          ((d.investAmount / d.valuation) * 100).toFixed(1)
        );
      }
    }
  };

  const submit = async () => {
    setError(null);
    const amount = Number(investAmount);
    const ownership = Number(ownershipPercent);
    const entry = Number(entryValuation);

    if (!companyName.trim()) return setError("기업명을 입력하세요");
    if (!amount || amount <= 0) return setError("투자금은 0보다 커야 합니다");
    if (!entry || entry <= 0) return setError("Entry 밸류는 0보다 커야 합니다");
    if (!ownership || ownership <= 0 || ownership > 100) {
      return setError("지분율은 0~100 사이여야 합니다");
    }

    setSaving(true);
    try {
      const res = await fetch("/api/portfolio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: companyName.trim(),
          sector,
          investedAt,
          investAmount: amount,
          ownershipPercent: ownership,
          entryValuation: entry,
          ...(dealId ? { dealId } : {}),
          ...(fundId !== NO_FUND ? { fundId } : {}),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error ?? "등록 실패");
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "등록 중 오류가 발생했습니다");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>포트폴리오사 추가</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {deals.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-gray-500">
                심사 완료 딜에서 승격 (선택)
              </Label>
              <div className="grid gap-1.5 max-h-36 overflow-y-auto">
                {deals.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => selectDeal(d)}
                    className={cn(
                      "text-left text-sm rounded-lg border px-3 py-2 transition-colors",
                      dealId === d.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-200 hover:border-gray-300"
                    )}
                  >
                    <span className="font-medium">{d.companyName}</span>
                    <span className="text-xs text-gray-500 ml-2">
                      {d.investAmount ? `${d.investAmount}억` : "금액 미입력"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label htmlFor="pf-name">기업명</Label>
              <Input
                id="pf-name"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="예: 헬스케어AI Inc."
              />
            </div>

            <div>
              <Label>섹터</Label>
              <Select value={sector} onValueChange={setSector}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SECTORS.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="pf-date">투자일</Label>
              <Input
                id="pf-date"
                type="date"
                value={investedAt}
                onChange={(e) => setInvestedAt(e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="pf-amount">투자금 (억원)</Label>
              <Input
                id="pf-amount"
                type="number"
                value={investAmount}
                onChange={(e) => setInvestAmount(e.target.value)}
                placeholder="100"
              />
            </div>

            <div>
              <Label htmlFor="pf-own">지분율 (%)</Label>
              <Input
                id="pf-own"
                type="number"
                value={ownershipPercent}
                onChange={(e) => setOwnershipPercent(e.target.value)}
                placeholder="12.5"
              />
            </div>

            <div>
              <Label htmlFor="pf-entry">Entry 밸류 (억원)</Label>
              <Input
                id="pf-entry"
                type="number"
                value={entryValuation}
                onChange={(e) => setEntryValuation(e.target.value)}
                placeholder="800"
              />
            </div>

            <div>
              <Label>펀드 (선택)</Label>
              <Select value={fundId} onValueChange={setFundId}>
                <SelectTrigger>
                  <SelectValue placeholder="펀드 미지정" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_FUND}>펀드 미지정</SelectItem>
                  {funds.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.name} ({f.vintageYear})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2 justify-end">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              취소
            </Button>
            <Button
              onClick={submit}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              등록
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
