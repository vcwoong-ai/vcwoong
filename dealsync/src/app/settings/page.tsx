"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Key, Bell, Shield } from "lucide-react";
import { useSession } from "next-auth/react";

export default function SettingsPage() {
  const { data: session } = useSession();

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">설정</h1>
        <p className="text-gray-500 mt-1 text-sm">계정 및 서비스 설정 관리</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {/* Profile */}
        <Card className="border-gray-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings className="w-4 h-4 text-blue-600" />
              프로필 설정
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>이름</Label>
              <Input defaultValue={session?.user?.name ?? ""} />
            </div>
            <div className="space-y-1.5">
              <Label>이메일</Label>
              <Input defaultValue={session?.user?.email ?? ""} disabled className="bg-gray-50" />
            </div>
            <div className="space-y-1.5">
              <Label>회사명</Label>
              <Input defaultValue={session?.user?.company ?? ""} />
            </div>
            <Button>저장</Button>
          </CardContent>
        </Card>

        {/* API Key */}
        <Card className="border-gray-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Key className="w-4 h-4 text-blue-600" />
              OpenAI API 설정
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-500">
              OpenAI API 키를 설정하면 실제 GPT-4 기반 보고서 생성이 활성화됩니다.
              환경변수 <code className="bg-gray-100 px-1 rounded text-xs">OPENAI_API_KEY</code>를 설정하거나 아래에 입력하세요.
            </p>
            <div className="space-y-1.5">
              <Label>OpenAI API Key</Label>
              <Input type="password" placeholder="sk-..." />
            </div>
            <Button>저장</Button>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card className="border-gray-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bell className="w-4 h-4 text-blue-600" />
              알림 설정
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-500">알림 기능은 곧 출시됩니다.</p>
          </CardContent>
        </Card>

        {/* Security */}
        <Card className="border-gray-100">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Shield className="w-4 h-4 text-blue-600" />
              보안
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>현재 비밀번호</Label>
              <Input type="password" />
            </div>
            <div className="space-y-1.5">
              <Label>새 비밀번호</Label>
              <Input type="password" />
            </div>
            <div className="space-y-1.5">
              <Label>비밀번호 확인</Label>
              <Input type="password" />
            </div>
            <Button>비밀번호 변경</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
