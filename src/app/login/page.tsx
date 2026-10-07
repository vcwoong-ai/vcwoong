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
import { BRAND } from "@/lib/brand";
import { isSuccessfulSignIn } from "@/lib/client-flow-status";

const loginSchema = z.object({
  email: z.string().trim().email("유효한 이메일을 입력해주세요"),
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

  const performSignIn = async (email: string, password: string) => {
    setLoading(true);
    setError(null);

    try {
      const result = await signIn("credentials", {
        email: email.trim(),
        password,
        redirect: false,
      });

      if (!isSuccessfulSignIn(result)) {
        setError("로그인에 실패했습니다. 계정 정보를 확인하고 잠시 후 다시 시도해 주세요.");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("서버 연결이 잠시 불안정합니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: LoginForm) => {
    await performSignIn(data.email, data.password);
  };

  return (
    <div className="min-h-screen flex">
      {/* 좌측 패널 — 로그인 폼과 무관하지만, 빈 화면보다 브랜드 톤을 각인시킨다.
          작은 화면에서는 공간이 부족해 숨긴다. */}
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="max-w-md text-center relative z-10">
          {/* next/image의 최적화는 래스터 이미지 대상이라 SVG엔 이득이
              없고, SVG는 next.config의 dangerouslyAllowSVG 없인 아예
              차단된다 — 정적 벡터 장식 이미지라 그냥 img로 충분하다. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/illustrations/login.svg"
            alt=""
            className="w-full max-w-sm mx-auto mb-8"
          />
          <h2 className="text-2xl font-bold text-white mb-2">
            섹터 전문 AI 심사역과 함께
          </h2>
          <p className="text-blue-300 text-sm leading-relaxed">
            딜소싱부터 투자심의위원회 보고서, LP 리포팅까지 —
            근거를 추적할 수 있는 투자심의 자동화.
          </p>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-4 bg-white">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-600 rounded-2xl mb-4">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-gray-900">{BRAND.name}</h1>
          <p className="text-gray-500 mt-1 text-sm">{BRAND.nameKr} · AI 투자심의 자동화</p>
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">비밀번호</Label>
                  <Link
                    href="/forgot-password"
                    className="text-xs text-blue-600 hover:underline"
                  >
                    비밀번호를 잊으셨나요?
                  </Link>
                </div>
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

            <div className="mt-4 text-center text-sm text-gray-500">
              계정이 없으신가요?{" "}
              <Link href="/register" className="text-blue-600 hover:underline font-medium">
                회원가입
              </Link>
            </div>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-400 mt-6">
          © 2026 {BRAND.name} · 투자심의 보고서 자동화
        </p>
      </div>
      </div>
    </div>
  );
}
