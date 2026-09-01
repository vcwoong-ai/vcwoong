"use client";

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Zap, AlertCircle, CheckCircle2 } from "lucide-react";
import { BRAND } from "@/lib/brand";

const schema = z
  .object({
    password: z
      .string()
      .min(8, "비밀번호는 8자 이상이어야 합니다")
      .regex(
        /^(?=.*[a-zA-Z])(?=.*\d)/,
        "비밀번호는 영문자와 숫자를 포함해야 합니다"
      ),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["confirm"],
  });

type Form = z.infer<typeof schema>;

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") ?? "";
  const email = searchParams.get("email") ?? "";

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Form>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: Form) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token, password: data.password }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "재설정에 실패했습니다");
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "재설정 중 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  if (!token || !email) {
    return (
      <div className="text-center space-y-4">
        <AlertCircle className="w-10 h-10 text-amber-500 mx-auto" />
        <p className="text-sm text-gray-600">
          링크가 올바르지 않습니다. 재설정을 다시 요청해 주세요.
        </p>
        <Button variant="outline" className="w-full" asChild>
          <Link href="/forgot-password">재설정 다시 요청</Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="text-center space-y-4">
        <CheckCircle2 className="w-10 h-10 text-green-500 mx-auto" />
        <p className="text-sm text-gray-600">
          비밀번호가 변경되었습니다. 로그인 화면으로 이동합니다...
        </p>
        <Button variant="outline" className="w-full" asChild>
          <Link href="/login">지금 로그인하기</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      <p className="text-xs text-gray-500">{email}</p>

      <div className="space-y-1.5">
        <Label htmlFor="password">새 비밀번호</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          {...register("password")}
          className={errors.password ? "border-red-300" : ""}
        />
        {errors.password && (
          <p className="text-xs text-red-500">{errors.password.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirm">새 비밀번호 확인</Label>
        <Input
          id="confirm"
          type="password"
          placeholder="••••••••"
          {...register("confirm")}
          className={errors.confirm ? "border-red-300" : ""}
        />
        {errors.confirm && (
          <p className="text-xs text-red-500">{errors.confirm.message}</p>
        )}
      </div>

      <Button
        type="submit"
        className="w-full bg-blue-600 hover:bg-blue-700"
        disabled={loading}
      >
        {loading ? "변경 중..." : "비밀번호 변경"}
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="space-y-1 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/illustrations/reset-password.svg"
              alt=""
              className="w-40 mx-auto mb-2"
            />
            <div className="flex justify-center mb-2">
              <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
                <Zap className="w-5 h-5 text-white" />
              </div>
            </div>
            <h1 className="text-xl font-bold text-gray-900">새 비밀번호 설정</h1>
          </CardHeader>
          <CardContent>
            {/* useSearchParams는 Suspense 경계 안에서만 프리렌더가 가능하다 */}
            <Suspense fallback={<p className="text-sm text-gray-500 text-center">불러오는 중...</p>}>
              <ResetPasswordForm />
            </Suspense>
          </CardContent>
        </Card>
        <p className="text-center text-xs text-gray-400 mt-4">
          {BRAND.name} · {BRAND.tagline}
        </p>
      </div>
    </div>
  );
}
