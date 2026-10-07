import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePlatformAdmin } from "@/lib/platform-admin-server";
import { loadAdminDemoWorkspace } from "@/lib/admin-demo";

export default async function AdminDemoPage() {
  await requirePlatformAdmin();
  const workspace = await loadAdminDemoWorkspace();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">데모 워크스페이스</h1>
        <p className="mt-2 text-sm text-muted-foreground">기존 데모 계정의 자료를 읽기 전용으로 검토합니다. 일반 고객 계정의 자료는 포함하지 않습니다.</p>
      </div>
      {!workspace ? (
        <Card><CardContent className="py-8 text-sm text-muted-foreground">이 환경에 데모 자료가 없습니다. 운영 데이터베이스에서 샘플 시드를 실행하지 마세요.</CardContent></Card>
      ) : ([
        { track: "vc", title: "VC 샘플", deals: workspace.vc },
        { track: "pe", title: "PE/M&A 샘플", deals: workspace.pe },
      ]).map((group) => (
        <section key={group.track} aria-label={group.title} className="space-y-3">
          <h2 className="text-lg font-semibold">{group.title}</h2>
          {group.deals.length === 0 && <p className="text-sm text-muted-foreground">등록된 샘플이 없습니다.</p>}
          <div className="grid gap-4 md:grid-cols-2">
            {group.deals.map((deal) => (
              <Card key={deal.id}>
                <CardHeader><CardTitle className="text-base"><Link className="hover:underline" href={`/admin/demo/${group.track}/${encodeURIComponent(deal.id)}`}>{deal.companyName}</Link></CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">{deal.name}</p>
                  <Badge variant="secondary">문서 {deal._count.documents}개</Badge>
                  {deal.reports[0] ? <p>{deal.reports[0].title} · {deal.reports[0]._count.sections}개 섹션</p> : <p className="text-muted-foreground">보고서 없음</p>}
                  <Link className="inline-block text-primary hover:underline" href={`/admin/demo/${group.track}/${encodeURIComponent(deal.id)}`}>샘플 상세 보기</Link>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">최근 수정된 샘플을 최대 12개 표시합니다.</p>
        </section>
      ))}
    </div>
  );
}
