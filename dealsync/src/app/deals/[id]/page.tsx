import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, DEAL_STATUSES } from "@/lib/utils";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Building2,
  BarChart3,
  FileText,
  Users,
  DollarSign,
  Sparkles,
  Globe,
  MapPin,
  Calendar,
  TrendingUp,
  ExternalLink,
} from "lucide-react";
import { DealActions } from "@/components/deals/deal-actions";
import { GenerateReportButton } from "@/components/deals/generate-report-button";
import { DocumentUpload } from "@/components/documents/document-upload";

export default async function DealDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session) redirect("/auth/signin");

  const deal = await prisma.deal.findFirst({
    where: { id, userId: session.user.id },
    include: {
      report: true,
      documents: {
        orderBy: { uploadedAt: "desc" },
        select: {
          id: true,
          fileName: true,
          originalName: true,
          fileType: true,
          fileSize: true,
          filePath: true,
          extractedText: true,
          uploadedAt: true,
        },
      },
    },
  });

  if (!deal) notFound();

  const statusInfo = DEAL_STATUSES[deal.status as keyof typeof DEAL_STATUSES] ?? DEAL_STATUSES.draft;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div className="flex items-start gap-3">
          <Link href="/deals">
            <Button variant="ghost" size="icon" className="rounded-full mt-1">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-gray-900">{deal.companyName}</h1>
              {deal.companyNameKo && (
                <span className="text-gray-400 text-lg">({deal.companyNameKo})</span>
              )}
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusInfo.color}`}>
                {statusInfo.label}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3.5 h-3.5" />
                {deal.sector}
                {deal.subSector && ` > ${deal.subSector}`}
              </span>
              <span className="flex items-center gap-1">
                <Badge variant="outline" className="text-xs">{deal.stage}</Badge>
              </span>
              {deal.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {deal.location}
                </span>
              )}
              {deal.founded && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  {deal.founded}년 설립
                </span>
              )}
              {deal.website && (
                <a
                  href={deal.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <Globe className="w-3.5 h-3.5" />
                  웹사이트
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <DealActions dealId={deal.id} currentStatus={deal.status} />
          {deal.report ? (
            <Link href={`/deals/${deal.id}/report`}>
              <Button variant="outline" className="gap-2">
                <FileText className="w-4 h-4" />
                보고서 보기
              </Button>
            </Link>
          ) : (
            <GenerateReportButton dealId={deal.id} />
          )}
        </div>
      </div>

      {/* Report Banner */}
      {deal.report && (
        <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 text-purple-600" />
            </div>
            <div>
              <div className="text-sm font-medium text-purple-900">
                투자심사보고서가 생성되었습니다
              </div>
              <div className="text-xs text-purple-600">
                {formatDate(deal.report.generatedAt)} 생성
                {deal.report.rating && ` · 등급: ${deal.report.rating}`}
                {deal.report.recommendation && ` · ${deal.report.recommendation}`}
              </div>
            </div>
          </div>
          <Link href={`/deals/${deal.id}/report`}>
            <Button size="sm" className="bg-purple-600 hover:bg-purple-700 gap-2">
              <FileText className="w-3.5 h-3.5" />
              보고서 열기
            </Button>
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          {/* Investment Terms */}
          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <DollarSign className="w-4 h-4 text-blue-600" />
                투자 조건
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: "투자 금액", value: deal.investmentAmount ? formatCurrency(deal.investmentAmount, deal.investmentCurrency) : "-" },
                  { label: "지분율", value: deal.equityStake ? `${deal.equityStake}%` : "-" },
                  { label: "Pre-Money", value: deal.preMoneyValuation ? formatCurrency(deal.preMoneyValuation, deal.investmentCurrency) : "-" },
                  { label: "총 라운드", value: deal.totalRoundSize ? formatCurrency(deal.totalRoundSize, deal.investmentCurrency) : "-" },
                  { label: "라운드 유형", value: deal.roundType || "-" },
                  { label: "리드 투자자", value: deal.leadInvestor || "-" },
                ].map((item) => (
                  <div key={item.label}>
                    <div className="text-xs text-gray-400 mb-0.5">{item.label}</div>
                    <div className="text-sm font-semibold text-gray-900">{item.value}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Business */}
          {(deal.businessDescription || deal.productService || deal.revenueModel) && (
            <Card className="border-gray-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="w-4 h-4 text-blue-600" />
                  사업 내용
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {deal.businessDescription && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">사업 개요</div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{deal.businessDescription}</p>
                  </div>
                )}
                {deal.productService && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">제품/서비스</div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{deal.productService}</p>
                  </div>
                )}
                {deal.revenueModel && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">수익 모델</div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{deal.revenueModel}</p>
                  </div>
                )}
                {deal.competitiveAdvantage && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">경쟁 우위</div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{deal.competitiveAdvantage}</p>
                  </div>
                )}
                {deal.targetMarket && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">목표 시장</div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{deal.targetMarket}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Team */}
          {(deal.ceoName || deal.teamDescription) && (
            <Card className="border-gray-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="w-4 h-4 text-blue-600" />
                  팀 정보
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {deal.ceoName && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">대표이사</div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-xs font-bold text-blue-600">{deal.ceoName[0]}</span>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-900">{deal.ceoName}</div>
                        {deal.ceoBackground && (
                          <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{deal.ceoBackground}</div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {deal.teamDescription && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">핵심 팀</div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{deal.teamDescription}</p>
                  </div>
                )}
                {deal.advisors && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">자문단</div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{deal.advisors}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Additional */}
          {(deal.keyRisks || deal.exitStrategy || deal.useOfFunds || deal.analystNotes) && (
            <Card className="border-gray-100">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="w-4 h-4 text-blue-600" />
                  추가 정보
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {deal.useOfFunds && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">자금 사용 계획</div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{deal.useOfFunds}</p>
                  </div>
                )}
                {deal.keyRisks && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">주요 리스크</div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{deal.keyRisks}</p>
                  </div>
                )}
                {deal.exitStrategy && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Exit 전략</div>
                    <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{deal.exitStrategy}</p>
                  </div>
                )}
                {deal.analystNotes && (
                  <div>
                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">심사역 메모</div>
                    <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3">
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{deal.analystNotes}</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Financials */}
          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="w-4 h-4 text-blue-600" />
                재무 현황
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {[
                { label: "전년도 매출", value: deal.revenueLastYear ? formatCurrency(deal.revenueLastYear, deal.investmentCurrency) : "-" },
                { label: "올해 매출", value: deal.revenueThisYear ? formatCurrency(deal.revenueThisYear, deal.investmentCurrency) : "-" },
                { label: "내년 예측", value: deal.revenueProjection ? formatCurrency(deal.revenueProjection, deal.investmentCurrency) : "-" },
                { label: "월 번 레이트", value: deal.burnRate ? formatCurrency(deal.burnRate, deal.investmentCurrency) : "-" },
                { label: "런웨이", value: deal.runway ? `${deal.runway}개월` : "-" },
                { label: "직원 수", value: deal.employeeCount ? `${deal.employeeCount}명` : "-" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">{item.label}</span>
                  <span className="text-sm font-medium text-gray-900">{item.value}</span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card className="border-gray-100">
            <CardHeader>
              <CardTitle className="text-base">딜 정보</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">생성일</span>
                <span className="text-xs text-gray-700">{formatDate(deal.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">최종 수정</span>
                <span className="text-xs text-gray-700">{formatDate(deal.updatedAt)}</span>
              </div>
              {deal.report && (
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-500">보고서 생성</span>
                  <span className="text-xs text-gray-700">{formatDate(deal.report.generatedAt)}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Document Upload */}
          <DocumentUpload
            dealId={deal.id}
            initialDocuments={deal.documents.map((d) => ({
              ...d,
              uploadedAt: d.uploadedAt.toISOString(),
            }))}
          />

          {/* Generate Report CTA */}
          {!deal.report && (
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white">
              <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center mb-3">
                <Sparkles className="w-5 h-5" />
              </div>
              <h3 className="font-semibold mb-1">AI 보고서 생성</h3>
              <p className="text-blue-100 text-xs mb-4">
                입력된 딜 정보와 업로드된 IR 자료를 바탕으로 전문 투자심사보고서를 자동 생성합니다.
              </p>
              <GenerateReportButton dealId={deal.id} variant="white" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
