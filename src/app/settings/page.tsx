import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppLayout } from "@/components/layout/app-layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Zap, Database, Shield } from "lucide-react";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const roleLabel: Record<string, string> = {
    ADMIN: "관리자",
    PARTNER: "파트너",
    ANALYST: "심사역",
  };

  return (
    <AppLayout title="설정">
      <div className="max-w-2xl space-y-6">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Shield className="w-4 h-4" />
              계정 정보
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-400">이름</p>
                <p className="font-medium">{session.user.name ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">이메일</p>
                <p className="font-medium">{session.user.email ?? "-"}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">역할</p>
                <Badge variant="secondary">
                  {roleLabel[session.user.role ?? "ANALYST"]}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Agents */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4" />
              AI 에이전트
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {[
                {
                  name: "General Agent",
                  desc: "범용 투자 분석 — 일반/소비재/딥테크/기후",
                  status: "활성",
                  color: "bg-green-50 text-green-700",
                  dot: "bg-green-400",
                },
                {
                  name: "Dr. Cell (Bio Agent)",
                  desc: "바이오/헬스케어 특화 — rNPV, 임상 분석",
                  status: "활성",
                  color: "bg-purple-50 text-purple-700",
                  dot: "bg-purple-400",
                },
                {
                  name: "IT Agent",
                  desc: "IT/SaaS/핀테크 특화 — SaaS 지표, 플랫폼",
                  status: "활성",
                  color: "bg-blue-50 text-blue-700",
                  dot: "bg-blue-400",
                },
              ].map((agent) => (
                <div
                  key={agent.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${agent.dot}`} />
                    <div>
                      <p className="font-medium text-sm">{agent.name}</p>
                      <p className="text-xs text-gray-500">{agent.desc}</p>
                    </div>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded ${agent.color} font-medium`}>
                    {agent.status}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              * AI 모델: Claude Sonnet 4.6 (Anthropic)
            </p>
          </CardContent>
        </Card>

        {/* Storage */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Database className="w-4 h-4" />
              스토리지
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-600 space-y-2">
              <div className="flex justify-between">
                <span>스토리지 모드</span>
                <Badge variant="outline">
                  {process.env.STORAGE_MODE === "s3" ? "AWS S3" : "로컬"}
                </Badge>
              </div>
              <p className="text-xs text-gray-400">
                프로덕션 배포 시 AWS S3로 전환하세요.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* IC Report Structure */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">투자심의보고서 구조</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {[
                "1. 투자개요 (Investment Overview)",
                "2. 회사개요 (Company Overview)",
                "3. 제품/기술 (Product & Technology)",
                "4. 시장분석 (Market Analysis)",
                "5. 재무현황 (Financial Status)",
                "6. 밸류에이션 (Valuation)",
                "7. 리스크 (Risk Analysis)",
                "8. 투자조건 (Investment Terms)",
                "9. 의견종합 (Opinion Summary)",
                "10. 별첨 (Appendix)",
              ].map((section) => (
                <div
                  key={section}
                  className="text-sm text-gray-600 flex items-center gap-2"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  {section}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
