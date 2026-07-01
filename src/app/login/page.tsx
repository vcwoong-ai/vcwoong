"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Zap, AlertCircle } from "lucide-react";
import Link from "next/link";

const loginSchema = z.object({
  email: z.string().email("유효한 이메일을 입력해주세요"),
  password: z.string().min(1, "비밀번호를 입력해주세요"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    setError(null);

    const result = await signIn("credentials", {
      email: data.email,
      password: data.password,
      redirect: false,
    });

    if (result?.error) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      setLoading(false);
    } else {
      router.push("/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-500 rounded-2xl mb-4">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white">DealSync</h1>
          <p className="text-blue-300 mt-1 text-sm">AI 투자심의 자동화 플랫폼</p>
        </div>

        <Card className="border-0 shadow-2xl">
          <CardHeader className="pb-2">
            <h2 className="text-xl font-semibold text-center text-gray-900">
              로그인
            </h2>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="analyst@vcfirm.co.kr"
                  {...register("email")}
                  className={errors.email ? "border-red-300" : ""}
                />
                {errors.email && (
                  <p className="text-xs text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  {...register("password")}
                  className={errors.password ? "border-red-300" : ""}
                />
                {errors.password && (
                  <p className="text-xs text-red-500">
                    {errors.password.message}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700"
                disabled={loading}
              >
                {loading ? "로그인 중..." : "로그인"}
              </Button>
            </form>

            {/* 데모 계정 빠른 로그인 */}
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs text-amber-700 font-medium mb-2">데모 계정으로 체험</p>
              <button
                type="button"
                onClick={async () => {
                  setLoading(true);
                  const result = await signIn("credentials", {
                    email: "demo@dealsync.kr",
                    password: "Demo1234!",
                    redirect: false,
                  });
                  if (!result?.error) { router.push("/dashboard"); router.refresh(); }
                  else setLoading(false);
                }}
                className="w-full text-xs text-amber-800 bg-amber-100 hover:bg-amber-200 rounded px-3 py-2 transition-colors"
                disabled={loading}
              >
                demo@dealsync.kr / Demo1234! 로 로그인
              </button>
            </div>

            <div className="mt-4 text-center text-sm text-gray-500">
              계정이 없으신가요?{" "}
              <Link href="/register" className="text-blue-600 hover:underline font-medium">
                회원가입
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-blue-900 mt-6">
          © 2026 DealSync · 투자심의 보고서 자동화
        </p>
      </div>
    </div>
  );
}
