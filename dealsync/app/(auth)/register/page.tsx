"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Zap, AlertCircle, CheckCircle } from "lucide-react";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    email: "",
    password: "",
    name: "",
    firm: "",
    role: "",
  });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "회원가입 중 오류가 발생했습니다.");
        return;
      }

      setSuccess(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("서버 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F1B35] to-[#1B3A6B] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[#1B4FD8]">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <span className="text-2xl font-bold text-white">DealSync</span>
        </div>

        <Card className="shadow-2xl border-0">
          <CardHeader className="pb-2 pt-6 px-6">
            <h2 className="text-xl font-bold text-gray-900">회원가입</h2>
            <p className="text-sm text-muted-foreground">
              새 계정을 만들어 시작하세요
            </p>
          </CardHeader>
          <CardContent className="px-6 pb-6">
            {success ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle className="w-12 h-12 text-green-500" />
                <p className="font-semibold text-gray-900">가입 완료!</p>
                <p className="text-sm text-muted-foreground">
                  로그인 페이지로 이동합니다...
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {error}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">이름</Label>
                    <Input
                      id="name"
                      placeholder="홍길동"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="h-10"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="firm">VC 회사명</Label>
                    <Input
                      id="firm"
                      placeholder="○○벤처스"
                      value={form.firm}
                      onChange={(e) => setForm({ ...form, firm: e.target.value })}
                      className="h-10"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role">직함</Label>
                  <Input
                    id="role"
                    placeholder="심사역, 팀장, 파트너..."
                    value={form.role}
                    onChange={(e) => setForm({ ...form, role: e.target.value })}
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="email">이메일 <span className="text-red-500">*</span></Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@firm.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    required
                    className="h-10"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">비밀번호 <span className="text-red-500">*</span></Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="최소 8자"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                    minLength={8}
                    className="h-10"
                  />
                </div>
                <Button
                  type="submit"
                  className="w-full bg-[#1B4FD8] hover:bg-[#1540B0] h-10"
                  disabled={loading}
                >
                  {loading ? "가입 중..." : "가입하기"}
                </Button>
              </form>
            )}
            <p className="text-center text-sm text-muted-foreground mt-4">
              이미 계정이 있으신가요?{" "}
              <Link href="/login" className="text-[#1B4FD8] font-medium hover:underline">
                로그인
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
