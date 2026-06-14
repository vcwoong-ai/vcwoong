"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Building2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

const SECTORS = ["IT", "BIO", "헬스케어", "핀테크", "제조", "커머스", "교육", "물류", "에너지", "기타"];
const STAGES = ["Pre-Seed", "Seed", "Pre-A", "Series A", "Series B", "Series C", "Pre-IPO"];
const STATUSES = ["검토중", "심층심사", "투심", "투자완료"];

export default function NewDealPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    companyName: "",
    sector: "",
    stage: "",
    amount: "",
    currency: "KRW",
    status: "검토중",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.companyName.trim()) {
      toast.error("회사명을 입력해주세요.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: form.amount ? parseFloat(form.amount) : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || "딜 생성에 실패했습니다.");
        return;
      }

      const deal = await res.json();
      toast.success("딜이 생성되었습니다!");
      router.push(`/deals/${deal.id}`);
    } catch {
      toast.error("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-border">
        <div className="flex items-center gap-3">
          <Link href="/deals">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              돌아가기
            </Button>
          </Link>
          <div className="h-5 w-px bg-border" />
          <h1 className="text-xl font-bold text-gray-900">새 딜 추가</h1>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl mx-auto">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                  <Building2 className="w-5 h-5 text-[#1B4FD8]" />
                </div>
                <div>
                  <h2 className="font-semibold text-gray-900">딜 정보 입력</h2>
                  <p className="text-sm text-muted-foreground">투자 검토 딜의 기본 정보를 입력하세요</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1.5">
                  <Label htmlFor="companyName">
                    회사명 <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    id="companyName"
                    placeholder="(주)회사명"
                    value={form.companyName}
                    onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                    required
                    className="h-10"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>섹터</Label>
                    <Select
                      value={form.sector}
                      onValueChange={(v: string | null) => setForm({ ...form, sector: v ?? "" })}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="섹터 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {SECTORS.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label>투자 단계</Label>
                    <Select
                      value={form.stage}
                      onValueChange={(v: string | null) => setForm({ ...form, stage: v ?? "" })}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue placeholder="단계 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        {STAGES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="amount">투자 금액 (억원)</Label>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="예: 10"
                      value={form.amount}
                      onChange={(e) => setForm({ ...form, amount: e.target.value })}
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>진행 상태</Label>
                    <Select
                      value={form.status}
                      onValueChange={(v: string | null) => setForm({ ...form, status: v ?? "검토중" })}
                    >
                      <SelectTrigger className="h-10">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>{s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex gap-3 pt-2">
                  <Button
                    type="submit"
                    className="bg-[#1B4FD8] hover:bg-[#1540B0] flex-1"
                    disabled={loading}
                  >
                    {loading ? "생성 중..." : "딜 생성하기"}
                  </Button>
                  <Link href="/deals">
                    <Button type="button" variant="outline">취소</Button>
                  </Link>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
