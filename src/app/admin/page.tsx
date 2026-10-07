import Link from "next/link";
import { ArrowRight, FlaskConical, DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BRAND } from "@/lib/brand";
import { requirePlatformAdmin } from "@/lib/platform-admin-server";

export default async function AdminPage() {
  const account = await requirePlatformAdmin();
  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm text-muted-foreground">운영 홈</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">서비스 운영과 데모 검토</h1>
        <p className="mt-3 text-sm text-muted-foreground">고객 업무 화면과 분리된 DealMind 운영자 전용 공간입니다.</p>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><FlaskConical className="h-5 w-5" />데모 워크스페이스</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">기존 샘플 딜과 보고서를 관리자 계정으로 검토합니다. 데모 계정으로 전환하지 않고 읽기 전용으로 확인합니다.</p>
            <Link href="/admin/demo" className="inline-flex items-center gap-2 text-sm font-medium text-primary">데모 검토하기<ArrowRight className="h-4 w-4" /></Link>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><DollarSign className="h-5 w-5" />AI 비용</CardTitle></CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">전체 서비스의 AI 호출 비용, 모델별 사용량과 비용이 확인되지 않은 호출을 점검합니다.</p>
            <Link href="/admin/usage-cost" className="inline-flex items-center gap-2 text-sm font-medium text-primary">비용 확인하기<ArrowRight className="h-4 w-4" /></Link>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">운영 연락처</CardTitle></CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p>고객 문의: <a className="break-all text-primary hover:underline" href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a></p>
          <p className="text-muted-foreground">로그인 계정: <span className="break-all">{account.email}</span></p>
        </CardContent>
      </Card>
    </div>
  );
}
