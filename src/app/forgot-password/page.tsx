"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Zap, AlertCircle, MailCheck } from "lucide-react";
import { BRAND } from "@/lib/brand";

const schema = z.object({
  email: z.string().email("유효한 이메일을 입력해주세요"),
});

type Form = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentMessage, setSentMessage] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: Form) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "요청에 실패했습니다");
      setSentMessage(json.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "요청 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="space-y-1 text-center">
            <div className="flex justify-center mb-2">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900">비밀번호 재설정</h1>
            <p className="text-sm text-gray-500">
              가입한 이메일로 재설정 링크를 보내드립니다.
            </p>
          </CardHeader>
          <CardContent>
            {sentMessage ? (
              <div className="text-center space-y-4">
                <MailCheck className="w-10 h-10 text-green-500 mx-auto" />
                <p className="text-sm text-gray-600">{sentMessage}</p>
                <Button variant="outline" className="w-full" asChild>
                  <Link href="/login">로그인으로 돌아가기</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {error && (
                  <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-xs text-red-600">{error}</p>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email">이메일</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@company.com"
                    {...register("email")}
                    className={errors.email ? "border-red-300" : ""}
                  />
                  {errors.email && (
                    <p className="text-xs text-red-500">{errors.email.message}</p>
                  )}
                </div>

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  disabled={loading}
                >
                  {loading ? "전송 중..." : "재설정 링크 받기"}
                </Button>

                <div className="text-center text-sm text-gray-500">
                  <Link href="/login" className="text-blue-600 hover:underline">
                    로그인으로 돌아가기
                  </Link>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
        <p className="text-center text-xs text-gray-400 mt-4">
          {BRAND.name} · {BRAND.tagline}
        </p>
      </div>
    </div>
  );
}
