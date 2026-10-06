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
import { PUBLIC_PLANS } from "@/lib/plans";
import Link from "next/link";
import { isSuccessfulSignIn } from "@/lib/client-flow-status";

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
 * 알 수 없는 트랙 값은 기본 카피로 안전하게 폴백한다.
 */
const TRACK_COPY: Record<string, { eyebrow: string; heading: string; sub: string }> = {
  vc: {
    eyebrow: "TRACK · VC 심사역",
    heading: "VC 트랙으로 시작합니다",
    sub: "가입 후 첫 VC 딜을 만들고 IR 자료를 올리세요. 보고서를 생성한 뒤 투자 논지와 수치 근거를 검토할 수 있습니다.",
  },
  pe: {
    eyebrow: "TRACK · PE · M&A",
    heading: "PE · M&A 트랙으로 시작합니다",
    sub: "가입 후 첫 PE/M&A 딜을 만드세요. 재무 기간과 계정을 입력하고 IC 의사결정에서 검토에 부족한 정보를 확인할 수 있습니다.",
  },
};

const DEFAULT_COPY = {
  eyebrow: "GET STARTED",
  heading: "첫 딜부터 검토를 시작하세요",
  sub: "가입 후 대시보드에서 VC 또는 PE/M&A 딜을 만들 수 있습니다. 자료 입력부터 근거 확인까지, 첫 행동을 안내합니다.",
};

function RegisterForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountCreated, setAccountCreated] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const track = searchParams.get("track") ?? "";
  const copy = TRACK_COPY[track] ?? DEFAULT_COPY;
  // 요금제에서 넘어온 경우(?plan=solo 등): 알려진 유료 플랜일 때만 인정하고, 가입 뒤 결제 화면으로 안내한다.
  // 청구·구독 처리 자체는 건드리지 않는다 — 이동 경로만 정한다.
  const requestedPlan = PUBLIC_PLANS.find((p) => p.key === searchParams.get("plan") && p.price > 0) ?? null;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (data: RegisterForm) => {
    if (accountCreated) return;
    setLoading(true);
    setError(null);
    let registered = false;

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
      registered = true;
      setAccountCreated(true);
      const result = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (!isSuccessfulSignIn(result)) {
        setError("가입은 완료되었지만 자동 로그인하지 못했습니다. 다시 가입하지 말고 로그인 화면에서 계정 정보를 입력해 주세요.");
        return;
      }

      router.push(
        requestedPlan
          ? `/settings?plan=${requestedPlan.key}#subscription`
          : track === "pe"
          ? "/ma-deals"
          : "/dashboard"
      );
    } catch (err) {
      setError(registered ? "가입은 완료되었습니다. 로그인 화면에서 다시 로그인해 주세요." : err instanceof Error ? err.message : "오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <header className="px-6 h-16 flex items-center border-b border-border bg-card">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm transition-colors text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          {BRAND.name}
        </Link>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <p className="text-xs font-semibold tracking-[0.08em] mb-4 uppercase text-primary">
            {copy.eyebrow}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{copy.heading}</h1>
          <p className="text-sm mt-2 leading-relaxed text-muted-foreground">{copy.sub}</p>
          {requestedPlan && (
            <p className="mt-3 rounded-md border border-state-info-line bg-state-info-bg px-3 py-2 text-sm text-state-info" data-testid="register-plan-note">
              선택한 플랜: <strong className="font-semibold">{requestedPlan.name}</strong>. 가입한 뒤 설정 화면의 구독 영역에서 결제를 진행합니다. 가입만으로 결제되지 않습니다.
            </p>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 mt-8">
            {error && (
              <div role="alert" className="flex items-center gap-2 p-3 rounded-md text-sm border border-state-critical-line bg-state-critical-bg text-state-critical">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
            {accountCreated && !loading && (
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">가입한 계정으로 로그인</Link>
              </Button>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-xs font-medium text-muted-foreground">
                이름
              </Label>
              <Input
                id="name"
                placeholder="홍길동"
                {...register("name")}
                className={errors.name ? "border-red-400" : ""}
              />
              {errors.name && (
                <p className="text-xs text-state-critical">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                이메일
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="analyst@vcfirm.co.kr"
                {...register("email")}
                className={errors.email ? "border-red-400" : ""}
              />
              {errors.email && (
                <p className="text-xs text-state-critical">{errors.email.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                비밀번호
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="8자 이상, 영문+숫자"
                {...register("password")}
                className={errors.password ? "border-red-400" : ""}
              />
              {errors.password && (
                <p className="text-xs text-state-critical">{errors.password.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="confirmPassword" className="text-xs font-medium text-muted-foreground">
                비밀번호 확인
              </Label>
              <Input
                id="confirmPassword"
                type="password"
                placeholder="비밀번호를 다시 입력하세요"
                {...register("confirmPassword")}
                className={errors.confirmPassword ? "border-red-400" : ""}
              />
              {errors.confirmPassword && (
                <p className="text-xs text-state-critical">{errors.confirmPassword.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full font-medium"
              disabled={loading || accountCreated}
            >
              {loading ? "가입 중..." : accountCreated ? "가입 완료" : "무료로 시작하기"}
            </Button>
            <p className="text-xs text-center text-muted-foreground">신용카드 없이 가입 · Free 플랜으로 시작</p>
          </form>

          <div className="mt-6 pt-6 border-t border-border text-center text-sm text-muted-foreground">
            이미 계정이 있으신가요?{" "}
            <Link href="/login" className="hover:underline font-medium text-primary">
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
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <RegisterForm />
    </Suspense>
  );
}
