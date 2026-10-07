import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requirePlatformAdmin } from "@/lib/platform-admin-server";
import { loadAdminDemoDetail } from "@/lib/admin-demo";

export default async function AdminDemoDetailPage({ params }: { params: { track: string; id: string } }) {
  await requirePlatformAdmin();
  const deal = await loadAdminDemoDetail(params.track, params.id);
  if (!deal) notFound();
  const report = deal.reports[0];
  return (
    <div className="space-y-6">
      <Link href="/admin/demo" className="text-sm text-primary hover:underline">← 데모 목록</Link>
      <div>
        <p className="text-sm text-muted-foreground">{params.track === "vc" ? "VC" : "PE/M&A"} · 관리자 데모 검토</p>
        <h1 className="mt-2 text-2xl font-semibold">{deal.companyName}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{deal.name}</p>
      </div>
      <Card>
        <CardHeader><CardTitle className="text-base">샘플 문서</CardTitle></CardHeader>
        <CardContent>
          {deal.documents.length ? <ul className="space-y-2 text-sm">{deal.documents.map((doc, i) => <li key={i}>{doc.name}</li>)}</ul>
            : <p className="text-sm text-muted-foreground">등록된 문서가 없습니다.</p>}
          <p className="mt-4 text-xs text-muted-foreground">최근 문서 최대 20개의 이름만 표시합니다. 원본 다운로드는 제공하지 않습니다.</p>
        </CardContent>
      </Card>
      {report ? (
        <section className="space-y-3" aria-label="샘플 보고서">
          <h2 className="text-lg font-semibold">{report.title}</h2>
          <p className="text-sm text-muted-foreground">최신 보고서의 최대 12개 섹션을 표시합니다. 샘플 내용을 실제 투자 근거로 사용하지 마세요.</p>
          {report.sections.map((section) => (
            <details key={section.id} className="rounded-lg border bg-card p-4">
              <summary className="cursor-pointer font-medium">{section.title}</summary>
              <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed">{section.content || "내용 없음"}</p>
              {section.truncated && <p className="mt-3 text-xs text-muted-foreground">이 미리보기는 앞 8,000자까지만 표시합니다.</p>}
            </details>
          ))}
        </section>
      ) : <p className="text-sm text-muted-foreground">생성된 샘플 보고서가 없습니다.</p>}
    </div>
  );
}
