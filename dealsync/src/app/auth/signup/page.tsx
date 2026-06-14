"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Eye, EyeOff, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const signupSchema = z.object({
  name: z.string().min(2, "이름은 2자 이상이어야 합니다"),
  email: z.string().email("올바른 이메일을 입력해주세요"),
  password: z.string().min(8, "비밀번호는 8자 이상이어야 합니다"),
  company: z.string().min(1, "회사명을 입력해주세요"),
});

type SignUpForm = z.infer<typeof signupSchema>;

const benefits = [
  "30분 내 전문 투자심사보고서 생성",
  "한국 VC 표준 양식 제공",
  "딜 파이프라인 통합 관리",
];

export default function SignUpPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignUpForm>({
    resolver: zodResolver(signupSchema),
  });

  const onSubmit = async (data: SignUpForm) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();

      if (!res.ok) {
        toast({
          title: "회원가입 실패",
          description: result.error,
          variant: "destructive",
        });
        return;
      }

      // Auto sign in after registration
      await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      router.push("/dashboard");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-white flex items-center justify-center p-4">
      <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
        {/* Left side */}
        <div className="hidden md:block">
          <Link href="/" className="inline-flex items-center gap-2 mb-8">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="text-2xl font-bold text-gray-900">DealSync</span>
          </Link>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">
            AI로 투자심사를
            <br />더 스마트하게
          </h2>
          <p className="text-gray-500 mb-8 leading-relaxed">
            한국 주요 벤처캐피탈이 신뢰하는 투자심사 자동화 플랫폼으로
            업무 효율을 90% 높이세요.
          </p>
          <div className="space-y-3">
            {benefits.map((benefit) => (
              <div key={benefit} className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                <span className="text-gray-700 text-sm">{benefit}</span>
              </div>
            ))}
          </div>
          <div className="mt-8 p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
            <p className="text-sm text-gray-600 italic">
              &ldquo;DealSync 덕분에 투자심사 보고서 작성 시간이 80% 줄었습니다.
              심사역들이 핵심 분석에 집중할 수 있게 됐어요.&rdquo;
            </p>
            <div className="mt-3 flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-blue-600">
                K
              </div>
              <div>
                <div className="text-xs font-semibold text-gray-900">김민준</div>
                <div className="text-xs text-gray-400">수석 심사역 · 파트너스인베스트먼트</div>
              </div>
            </div>
          </div>
        </div>

        {/* Right side - Form */}
        <div>
          <div className="md:hidden text-center mb-6">
            <Link href="/" className="inline-flex items-center gap-2">
              <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <span className="text-2xl font-bold text-gray-900">DealSync</span>
            </Link>
          </div>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-gray-900">무료 계정 만들기</h1>
              <p className="text-gray-500 text-sm mt-1">14일 무료 체험 · 신용카드 불필요</p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">이름</Label>
                <Input
                  id="name"
                  placeholder="홍길동"
                  {...register("name")}
                />
                {errors.name && (
                  <p className="text-xs text-red-500">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="company">회사명</Label>
                <Input
                  id="company"
                  placeholder="ABC벤처스"
                  {...register("company")}
                />
                {errors.company && (
                  <p className="text-xs text-red-500">{errors.company.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email">업무용 이메일</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@company.com"
                  {...register("email")}
                />
                {errors.email && (
                  <p className="text-xs text-red-500">{errors.email.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password">비밀번호</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="8자 이상 입력"
                    {...register("password")}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
                {errors.password && (
                  <p className="text-xs text-red-500">{errors.password.message}</p>
                )}
              </div>

              <Button type="submit" className="w-full mt-2" disabled={isLoading}>
                {isLoading ? "계정 생성 중..." : "무료로 시작하기"}
              </Button>
            </form>

            <p className="text-xs text-gray-400 text-center mt-4">
              가입하면{" "}
              <a href="#" className="underline hover:text-gray-600">이용약관</a>과{" "}
              <a href="#" className="underline hover:text-gray-600">개인정보처리방침</a>에 동의하는 것입니다.
            </p>
          </div>

          <p className="text-center text-sm text-gray-500 mt-4">
            이미 계정이 있으신가요?{" "}
            <Link href="/auth/signin" className="text-blue-600 font-medium hover:underline">
              로그인
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
