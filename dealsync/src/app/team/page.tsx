import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, UserPlus } from "lucide-react";

export default async function TeamPage() {
  const session = await getServerSession(authOptions);

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">팀 관리</h1>
          <p className="text-gray-500 mt-1 text-sm">팀원을 초대하고 협업하세요</p>
        </div>
        <Button className="gap-2" disabled>
          <UserPlus className="w-4 h-4" />
          팀원 초대
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-gray-100">
          <CardHeader>
            <CardTitle className="text-base">내 프로필</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <span className="text-lg font-bold text-blue-600">
                  {user?.name?.[0] ?? "U"}
                </span>
              </div>
              <div>
                <div className="font-medium text-gray-900">{user?.name}</div>
                <div className="text-sm text-gray-500">{user?.email}</div>
                <div className="text-xs text-blue-600 mt-0.5">{user?.company}</div>
              </div>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">역할</span>
                <span className="font-medium capitalize">{user?.role}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center">
            <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users className="w-7 h-7 text-blue-400" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">팀 협업 기능 (준비 중)</h3>
            <p className="text-gray-500 text-sm">
              팀원 초대, 역할 관리, 댓글 및 협업 기능이 곧 출시됩니다.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
