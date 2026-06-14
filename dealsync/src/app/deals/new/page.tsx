"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { SECTORS, STAGES } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  DollarSign,
  Users,
  BarChart3,
  FileText,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

const dealSchema = z.object({
  companyName: z.string().min(1, "기업명을 입력해주세요"),
  companyNameKo: z.string().optional(),
  founded: z.string().optional(),
  sector: z.string().min(1, "섹터를 선택해주세요"),
  subSector: z.string().optional(),
  stage: z.string().min(1, "투자 단계를 선택해주세요"),
  location: z.string().optional(),
  website: z.string().optional(),
  employeeCount: z.string().optional(),

  investmentAmount: z.string().optional(),
  equityStake: z.string().optional(),
  preMoneyValuation: z.string().optional(),
  roundType: z.string().optional(),
  totalRoundSize: z.string().optional(),
  leadInvestor: z.string().optional(),

  businessDescription: z.string().optional(),
  productService: z.string().optional(),
  revenueModel: z.string().optional(),
  competitiveAdvantage: z.string().optional(),
  targetMarket: z.string().optional(),
  marketSize: z.string().optional(),

  ceoName: z.string().optional(),
  ceoBackground: z.string().optional(),
  teamDescription: z.string().optional(),
  advisors: z.string().optional(),

  revenueLastYear: z.string().optional(),
  revenueThisYear: z.string().optional(),
  revenueProjection: z.string().optional(),
  burnRate: z.string().optional(),
  runway: z.string().optional(),
  customers: z.string().optional(),
  keyMetrics: z.string().optional(),

  keyRisks: z.string().optional(),
  exitStrategy: z.string().optional(),
  useOfFunds: z.string().optional(),
  analystNotes: z.string().optional(),
});

type DealForm = z.infer<typeof dealSchema>;

const steps = [
  { id: 1, label: "기업 정보", icon: Building2 },
  { id: 2, label: "투자 조건", icon: DollarSign },
  { id: 3, label: "사업 내용", icon: FileText },
  { id: 4, label: "팀", icon: Users },
  { id: 5, label: "재무", icon: BarChart3 },
  { id: 6, label: "추가 정보", icon: Sparkles },
];

export default function NewDealPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    trigger,
    formState: { errors },
  } = useForm<DealForm>({
    resolver: zodResolver(dealSchema),
    defaultValues: {
      sector: "",
      stage: "",
    },
  });

  const nextStep = async () => {
    const fieldsToValidate = currentStep === 1
      ? ["companyName", "sector", "stage"]
      : [];
    const valid = fieldsToValidate.length
      ? await trigger(fieldsToValidate as (keyof DealForm)[])
      : true;
    if (valid) setCurrentStep((s) => Math.min(s + 1, steps.length));
  };

  const prevStep = () => setCurrentStep((s) => Math.max(s - 1, 1));

  const onSubmit = async (data: DealForm) => {
    setIsLoading(true);
    try {
      const payload = {
        ...data,
        employeeCount: data.employeeCount ? parseInt(data.employeeCount) : undefined,
        investmentAmount: data.investmentAmount ? parseFloat(data.investmentAmount) : undefined,
        equityStake: data.equityStake ? parseFloat(data.equityStake) : undefined,
        preMoneyValuation: data.preMoneyValuation ? parseFloat(data.preMoneyValuation) : undefined,
        totalRoundSize: data.totalRoundSize ? parseFloat(data.totalRoundSize) : undefined,
        revenueLastYear: data.revenueLastYear ? parseFloat(data.revenueLastYear) : undefined,
        revenueThisYear: data.revenueThisYear ? parseFloat(data.revenueThisYear) : undefined,
        revenueProjection: data.revenueProjection ? parseFloat(data.revenueProjection) : undefined,
        burnRate: data.burnRate ? parseFloat(data.burnRate) : undefined,
        runway: data.runway ? parseInt(data.runway) : undefined,
      };

      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error("딜 저장에 실패했습니다");
      }

      const deal = await res.json();
      toast({ title: "딜이 저장되었습니다", variant: "default" });
      router.push(`/deals/${deal.id}`);
    } catch {
      toast({ title: "오류가 발생했습니다", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <Link href="/deals">
          <Button variant="ghost" size="icon" className="rounded-full">
            <ArrowLeft className="w-4 h-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">새 딜 추가</h1>
          <p className="text-gray-500 text-sm">투자 검토 정보를 입력하세요</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-2">
        {steps.map((step, i) => (
          <div key={step.id} className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => step.id < currentStep && setCurrentStep(step.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                step.id === currentStep
                  ? "bg-blue-600 text-white"
                  : step.id < currentStep
                  ? "bg-green-100 text-green-700 cursor-pointer hover:bg-green-200"
                  : "bg-gray-100 text-gray-400"
              }`}
            >
              {step.id < currentStep ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <step.icon className="w-3.5 h-3.5" />
              )}
              {step.label}
            </button>
            {i < steps.length - 1 && (
              <div className={`w-6 h-0.5 ${step.id < currentStep ? "bg-green-300" : "bg-gray-200"}`} />
            )}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        {/* Step 1: Company Info */}
        {currentStep === 1 && (
          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Building2 className="w-5 h-5 text-blue-600" />
                기업 기본 정보
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="companyName">기업명 (영문) *</Label>
                  <Input id="companyName" placeholder="TechStartup Inc." {...register("companyName")} />
                  {errors.companyName && <p className="text-xs text-red-500">{errors.companyName.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="companyNameKo">기업명 (한글)</Label>
                  <Input id="companyNameKo" placeholder="테크스타트업" {...register("companyNameKo")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>섹터 *</Label>
                  <Controller
                    name="sector"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="섹터 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {SECTORS.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.sector && <p className="text-xs text-red-500">{errors.sector.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="subSector">세부 섹터</Label>
                  <Input id="subSector" placeholder="예: 생성형 AI, 디지털 헬스" {...register("subSector")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>투자 단계 *</Label>
                  <Controller
                    name="stage"
                    control={control}
                    render={({ field }) => (
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <SelectTrigger>
                          <SelectValue placeholder="단계 선택" />
                        </SelectTrigger>
                        <SelectContent>
                          {STAGES.map((s) => (
                            <SelectItem key={s} value={s}>{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {errors.stage && <p className="text-xs text-red-500">{errors.stage.message}</p>}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="founded">설립연도</Label>
                  <Input id="founded" placeholder="2021" {...register("founded")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="location">소재지</Label>
                  <Input id="location" placeholder="서울특별시 강남구" {...register("location")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="employeeCount">직원 수</Label>
                  <Input id="employeeCount" type="number" placeholder="25" {...register("employeeCount")} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="website">웹사이트</Label>
                <Input id="website" placeholder="https://example.com" {...register("website")} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 2: Investment Terms */}
        {currentStep === 2 && (
          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <DollarSign className="w-5 h-5 text-blue-600" />
                투자 조건
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="investmentAmount">투자 금액 (원)</Label>
                  <Input id="investmentAmount" type="number" placeholder="5000000000" {...register("investmentAmount")} />
                  <p className="text-xs text-gray-400">예: 50억원 = 5000000000</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="equityStake">지분율 (%)</Label>
                  <Input id="equityStake" type="number" step="0.01" placeholder="10.5" {...register("equityStake")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="preMoneyValuation">Pre-Money Valuation (원)</Label>
                  <Input id="preMoneyValuation" type="number" placeholder="50000000000" {...register("preMoneyValuation")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="totalRoundSize">총 라운드 규모 (원)</Label>
                  <Input id="totalRoundSize" type="number" placeholder="10000000000" {...register("totalRoundSize")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="roundType">라운드 유형</Label>
                  <Input id="roundType" placeholder="우선주, 전환사채 등" {...register("roundType")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="leadInvestor">리드 투자자</Label>
                  <Input id="leadInvestor" placeholder="ABC벤처스" {...register("leadInvestor")} />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Business */}
        {currentStep === 3 && (
          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="w-5 h-5 text-blue-600" />
                사업 내용
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="businessDescription">사업 개요</Label>
                <Textarea
                  id="businessDescription"
                  placeholder="회사의 핵심 비즈니스와 해결하는 문제를 설명해주세요"
                  rows={4}
                  {...register("businessDescription")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="productService">제품/서비스</Label>
                <Textarea
                  id="productService"
                  placeholder="주요 제품이나 서비스를 설명해주세요"
                  rows={3}
                  {...register("productService")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="revenueModel">수익 모델</Label>
                <Textarea
                  id="revenueModel"
                  placeholder="수익 창출 방식을 설명해주세요"
                  rows={3}
                  {...register("revenueModel")}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="targetMarket">목표 시장</Label>
                  <Textarea
                    id="targetMarket"
                    placeholder="주요 고객층과 목표 시장"
                    rows={3}
                    {...register("targetMarket")}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="marketSize">시장 규모</Label>
                  <Textarea
                    id="marketSize"
                    placeholder="TAM/SAM/SOM 등 시장 규모 정보"
                    rows={3}
                    {...register("marketSize")}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="competitiveAdvantage">경쟁 우위</Label>
                <Textarea
                  id="competitiveAdvantage"
                  placeholder="기술적/사업적 차별화 요소와 경쟁 우위"
                  rows={3}
                  {...register("competitiveAdvantage")}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Team */}
        {currentStep === 4 && (
          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="w-5 h-5 text-blue-600" />
                팀 정보
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="ceoName">대표이사 성명</Label>
                  <Input id="ceoName" placeholder="홍길동" {...register("ceoName")} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ceoBackground">대표이사 이력</Label>
                <Textarea
                  id="ceoBackground"
                  placeholder="대표이사의 학력, 경력, 주요 성과 등"
                  rows={4}
                  {...register("ceoBackground")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="teamDescription">핵심 팀 소개</Label>
                <Textarea
                  id="teamDescription"
                  placeholder="CTO, CFO 등 주요 임원 및 핵심 구성원 소개"
                  rows={4}
                  {...register("teamDescription")}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="advisors">자문단/투자자</Label>
                <Textarea
                  id="advisors"
                  placeholder="주요 자문단, 기존 투자자 등"
                  rows={3}
                  {...register("advisors")}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 5: Financials */}
        {currentStep === 5 && (
          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BarChart3 className="w-5 h-5 text-blue-600" />
                재무 정보
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="revenueLastYear">전년도 매출 (원)</Label>
                  <Input id="revenueLastYear" type="number" placeholder="0" {...register("revenueLastYear")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="revenueThisYear">올해 매출 (원)</Label>
                  <Input id="revenueThisYear" type="number" placeholder="0" {...register("revenueThisYear")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="revenueProjection">내년 매출 예측 (원)</Label>
                  <Input id="revenueProjection" type="number" placeholder="0" {...register("revenueProjection")} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="burnRate">월 번 레이트 (원)</Label>
                  <Input id="burnRate" type="number" placeholder="100000000" {...register("burnRate")} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="runway">런웨이 (개월)</Label>
                  <Input id="runway" type="number" placeholder="12" {...register("runway")} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="customers">고객 현황</Label>
                <Textarea
                  id="customers"
                  placeholder="주요 고객사, MAU/DAU, 고객 수 등"
                  rows={3}
                  {...register("customers")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="keyMetrics">핵심 지표 (KPIs)</Label>
                <Textarea
                  id="keyMetrics"
                  placeholder="MoM 성장률, 전환율, CAC, LTV, NPS 등 핵심 지표"
                  rows={4}
                  {...register("keyMetrics")}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step 6: Additional */}
        {currentStep === 6 && (
          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="w-5 h-5 text-blue-600" />
                추가 정보
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="useOfFunds">자금 사용 계획</Label>
                <Textarea
                  id="useOfFunds"
                  placeholder="투자금 사용 목적 및 계획 (제품 개발, 인력 채용, 마케팅 등)"
                  rows={4}
                  {...register("useOfFunds")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="keyRisks">주요 리스크</Label>
                <Textarea
                  id="keyRisks"
                  placeholder="투자 시 예상되는 주요 위험 요소"
                  rows={4}
                  {...register("keyRisks")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="exitStrategy">Exit 전략</Label>
                <Textarea
                  id="exitStrategy"
                  placeholder="IPO, M&A 등 예상 exit 전략 및 시나리오"
                  rows={3}
                  {...register("exitStrategy")}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="analystNotes">심사역 메모</Label>
                <Textarea
                  id="analystNotes"
                  placeholder="미팅 인상, 특이사항, 추가 검토 필요 사항 등"
                  rows={4}
                  {...register("analystNotes")}
                />
              </div>
            </CardContent>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={prevStep}
            disabled={currentStep === 1}
            className="gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            이전
          </Button>

          {currentStep < steps.length ? (
            <Button type="button" onClick={nextStep} className="gap-2">
              다음
              <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button type="submit" disabled={isLoading} className="gap-2">
              {isLoading ? (
                <>처리 중...</>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  딜 저장하기
                </>
              )}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}
