import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import TopBar from "@/components/layout/TopBar";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { User, Shield, Database } from "lucide-react";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="flex flex-col h-full">
      <TopBar title="설정" subtitle="계정 및 시스템 설정을 관리합니다" />
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-4">
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-[#1B4FD8]" />
                <h3 className="font-semibold text-sm">계정 정보</h3>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">이름</span>
                <span className="text-sm font-medium">{session?.user?.name || "-"}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">이메일</span>
                <span className="text-sm font-medium">{session?.user?.email}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">회사</span>
                <span className="text-sm font-medium">
                  {(session?.user as any)?.firm || "-"}
                </span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">직함</span>
                <span className="text-sm font-medium">
                  {(session?.user as any)?.role || "-"}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-[#1B4FD8]" />
                <h3 className="font-semibold text-sm">AI 설정</h3>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">AI 모델</span>
                <Badge variant="secondary" className="text-xs">claude-sonnet-4-5</Badge>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-muted-foreground">섹터 자동 감지</span>
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">활성화</Badge>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-muted-foreground">바이오 특화 프롬프트</span>
                <Badge className="bg-green-100 text-green-700 hover:bg-green-100 text-xs">활성화</Badge>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#1B4FD8]" />
                <h3 className="font-semibold text-sm">보안</h3>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                모든 데이터는 암호화되어 저장됩니다. 업로드된 문서는 로컬 서버에만 보관됩니다.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
