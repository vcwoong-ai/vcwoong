"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Check } from "lucide-react";

interface ProfileFormProps {
  currentName: string;
}

export function ProfileForm({ currentName }: ProfileFormProps) {
  const [name, setName] = useState(currentName);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const body: Record<string, string> = { name };
      if (newPassword) {
        body.currentPassword = currentPassword;
        body.newPassword = newPassword;
      }

      const res = await fetch("/api/user/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "업데이트 실패");
        return;
      }

      setSuccess(true);
      setCurrentPassword("");
      setNewPassword("");
      setTimeout(() => setSuccess(false), 3000);
    } catch {
      setError("서버 오류가 발생했습니다");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="name">이름</Label>
        <Input
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름"
          required
        />
      </div>

      <div className="border-t pt-4 space-y-3">
        <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
          비밀번호 변경 (선택)
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="current-pw">현재 비밀번호</Label>
          <Input
            id="current-pw"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="현재 비밀번호"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="new-pw">새 비밀번호</Label>
          <Input
            id="new-pw"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="8자 이상"
          />
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </p>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : success ? (
          <Check className="w-4 h-4 mr-2 text-green-500" />
        ) : null}
        {success ? "저장 완료!" : "저장"}
      </Button>
    </form>
  );
}
