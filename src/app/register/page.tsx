"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { signIn } from "next-auth/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { BRAND } from "@/lib/brand";
import Link from "next/link";

const registerSchema = z
  .object({
    name: z.string().min(2, "이름은 2자 이상이어야 합니다"),
    email: z.string().email("유효한 이메일을 입력해주세요"),
    password: z
      .string()
      .min(8, "비밀번호는 8자 이상이어야 합니다")
      .regex(
        /^(?=.*[a-zA-Z])(?=.*\d)/,
        "영문자와 숫자를 포함해야 합니다"
      ),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "비밀번호가 일치하지 않습니다",
    path: ["confirmPassword"],
  });

type RegisterForm = z.infer<typeof registerSchema>;

/**
 * 트랙별 카피만 바꾼다 — DB에 track을 저장하는 필드가 없어(스키마 변경
 * 없이는 영속화 불가) 여기서는 가입 화면의 문구만 트랙에 맞춘다.
 * VC 외 트랙(예: pe)은 랜딩에서 실제로 이 URL로 연결되지 않으므로
 * (아직 "Coming soon" — FAQ로 스크롤) 기본 카피로 안전하게 폴백한다.
 */
const TRACK_COPY: Record<string, { eyebrow: string; heading: string; sub: string }> = {
  vc: {
    eyebrow: "TRACK · VC 심사역",
    heading: "VC 트랙으로 시작합니다",
    sub: "섹터 전문 AI 6명이 투자심의보고서 초안을 씁니다. 신용카드 없이 무료로 시작하세요.",
  },
};

const DEFAULT_COPY = {
  eyebrow: "GET STARTED",
  heading: "5분 안에 첫 보고서를 시작하세요",
  sub: "신용카드 없이 무료로 시작 — 6개 섹터 전문 AI 에이전트를 지금 바로 사용할 수 있습니다.",
};

function RegisterForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const track = searchParams.get("track") ?? "";
  const copy = TRACK_COPY[track] ?? DEFAULT_COPY;
  /**
   * VC는 가입 후 실제로 들어가는 대시보드가 블루 톤(--primary 토큰, 기존
   * bg-blue-600 계열)이라 그 경험을 그대로 이어받는다. 그 외 트랙(아직
   * 랜딩에서 연결되지 않은 PE 포함)은 랜딩 전체의 블랙&화이트 톤을
   * 기본값으로 유지 — 트랙이 실제로 연결되는 시점에 그 트랙의 제품
   * 경험에 맞춰 다시 정하면 된다.
   */
  const isVc = track === "vc";

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (data: RegisterForm) => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          email: data.email,
          password: data.password,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "회원가입 실패");
      }

      // Auto login after registration
      await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`min-h-screen flex flex-col ${isVc ? "bg-white text-slate-900" : "bg-black text-white"}`}>
      <header className={`px-6 h-16 flex items-center border-b ${isVc ? "border-slate-200" : "border-white/10"}`}>
        <Link
          href="/"
          className={`inline-flex items-center gap-2 text-sm transition-colors ${isVc ? "text-slate-500 hover:text-slate-900" : "text-white/50 hover:text-white"}`}
        >
          <ArrowLeft className="w-4 h-4" />
          {BRAND.name}
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <p className={`text-xs font-mono tracking-[0.2em] mb-4 uppercase ${isVc ? "text-blue-600" : "text-white/40"}`}>
            {copy.eyebrow}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{copy.heading}</h1>
          <p className={`text-sm mt-2 leading-relaxed ${isVc ? "text-slate-500" : "text-white/50"}`}>{copy.sub}</p>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-8">
            {error && (
              <div className={`flex items-center gap-2 p-3 rounded-sm text-sm ${isVc ? "bg-red-50 border border-red-200 text-red-700" : "bg-red-500/10 border border-red-500/30 text-red-300"}`}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="name" className={`text-xs font-mono tracking-wider uppercase ${isVc ? "text-slate-500" : "text-white/50"}`}>
                이름
              </Label>
              <Input
                id="name"
                placeholder="홍길동"
                {...register("name")}
                className={isVc ? (errors.name ? "border-red-400" : "") : `bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:ring-white/30 focus-visible:border-white/40 ${errors.name ? "border-red-500/50" : ""}`}
              />
              {errors.name && (
                <p className={`text-xs ${isVc ? "text-red-500" : "text-red-400"}`}>{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className={`text-xs font-mono tracking-wider uppercase ${isVc ? "text-slate-500" : "text-white/50"}`}>
                이메일
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="analyst@vcfirm.co.kr"
                {...register("email")}
                className={isVc ? (errors.email ? "border-red-400" : "") : `bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:ring-white/30 focus-visible:border-white/40 ${errors.email ? "border-red-500/50" : ""}`}
              />
              {errors.email && (
                <p className={`text-xs ${isVc ? "text-red-500" : "text-red-400"}`}>{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className={`text-xs font-mono tracking-wider uppercase ${isVc ? "text-slate-500" : "text-white/50"}`}>
                비밀번호
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="8자 이상, 영문+숫자"
                {...register("password")}
                className={isVc ? (errors.password ? "border-red-400" : "") : `bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:ring-white/30 focus-visible:border-white/40 ${errors.password ? "border-red-500/50" : ""}`}
              />
              {errors.password && (
                <p className={`text-xs ${isVc ? "text-red-500" : "text-red-400"}`}>{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className={`text-xs font-mono tracking-wider uppercase ${isVc ? "text-slate-500" : "text-white/50"}`}>
                비밀번호 확인
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="비밀번호를 다시 입력하세요"
                {...register("confirmPassword")}
                className={isVc ? (errors.confirmPassword ? "border-red-400" : "") : `bg-white/5 border-white/15 text-white placeholder:text-white/30 focus-visible:ring-white/30 focus-visible:border-white/40 ${errors.confirmPassword ? "border-red-500/50" : ""}`}
              />
              {errors.confirmPassword && (
                <p className={`text-xs ${isVc ? "text-red-500" : "text-red-400"}`}>{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className={isVc ? "w-full font-medium" : "w-full bg-white text-black hover:bg-white/90 rounded-sm font-medium"}
              disabled={loading}
            >
              {loading ? "가입 중..." : "무료로 시작하기"}
            </Button>
            <p className={`text-xs text-center ${isVc ? "text-slate-400" : "text-white/30"}`}>신용카드 불필요 · 5분 이내 설정 · 월 5건 무료</p>
          </form>

          <div className={`mt-6 pt-6 border-t text-center text-sm ${isVc ? "border-slate-200 text-slate-500" : "border-white/10 text-white/40"}`}>
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className={`hover:underline font-medium ${isVc ? "text-blue-600" : "text-white"}`}>
              로그인
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-black" />}>
      <RegisterForm />
    </Suspense>
  );
}
