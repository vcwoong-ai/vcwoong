import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LayoutTemplate, Plus, ArrowRight } from "lucide-react";

export default async function TemplatesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const templates = await prisma.template.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  return (
    <AppLayout title="양식 관리">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">양식 관리</h1>
            <p className="text-sm text-gray-500 mt-1">VC 투자심사보고서 양식을 등록하고 관리하세요</p>
          </div>
          <Link href="/dashboard/templates/new">
            <Button className="gap-2">
              <Plus className="w-4 h-4" />
              양식 등록
            </Button>
          </Link>
        </div>

        {templates.length === 0 ? (
          <div className="text-center py-24 space-y-4">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto">
              <LayoutTemplate className="w-8 h-8 text-gray-400" />
            </div>
            <p className="text-gray-500">등록된 양식이 없습니다.</p>
            <p className="text-sm text-gray-400">PPTX 파일을 업로드하면 AI가 자동으로 필드를 매핑합니다.</p>
            <Link href="/dashboard/templates/new">
              <Button variant="outline">양식 등록하기</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {templates.map((template) => (
              <div
                key={template.id}
                className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-100 hover:border-gray-300 hover:shadow-sm transition-all"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-purple-50 flex items-center justify-center flex-shrink-0">
                    <LayoutTemplate className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">{template.name}</p>
                    <p className="text-sm text-gray-500 mt-0.5">
                      {new Date(template.createdAt).toLocaleDateString("ko-KR")} 등록
                    </p>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300" />
              </div>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
