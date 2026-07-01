"use client";

import { useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { AppLayout } from "@/components/layout/app-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Zap, Database, Shield, LogOut, Save, KeyRound } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "관리자",
  PARTNER: "파트너",
  ANALYST: "심사역",
};

const AGENTS = [
  { name: "General Agent", desc: "범용 투자 분석 — 일반/소비재/딥테크/기후", dot: "bg-green-400" },
  { name: "Dr. Cell (Bio Agent)", desc: "바이오/헬스케어 특화 — rNPV, 임상 분석", dot: "bg-purple-400" },
  { name: "IT/SaaS Agent", desc: "IT/SaaS/핀테크 특화 — SaaS 지표, 플랫폼", dot: "bg-blue-400" },
  { name: "Neuron (AI/딥테크)", desc: "AI·딥테크 특화 — 기술 해자, IP 분석", dot: "bg-indigo-400" },
  { name: "Maker (제조)", desc: "제조/하드웨어 특화 — 공정, BOM 분석", dot: "bg-orange-400" },
  { name: "Vault (핀테크)", desc: "핀테크/금융 특화 — 규제, 수익 구조", dot: "bg-emerald-400" },
];

export default function SettingsPage() {
  const { data: session, update } = useSession();

  const [name, setName] = useState(session?.user?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState("");

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [savingPw, setSavingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  const handleSaveName = async () => {
    if (!name.trim()) return;
    setSavingName(true);
    setNameMsg("");
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      await update({ name });
      setNameMsg("저장되었습니다.");
    } catch (e) {
      setNameMsg(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setSavingName(false);
    }
  };

  const handleSavePw = async () => {
    if (newPw !== confirmPw) { setPwMsg("새 비밀번호가 일치하지 않습니다."); return; }
    if (newPw.length < 8) { setPwMsg("비밀번호는 8자 이상이어야 합니다."); return; }
    setSavingPw(true);
    setPwMsg("");
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPwMsg("비밀번호가 변경되었습니다.");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    } catch (e) {
      setPwMsg(e instanceof Error ? e.message : "오류가 발생했습니다.");
    } finally {
      setSavingPw(false);
    }
  };

  if (!session) return null;

  return (
    <AppLayout title="설정">
      <div className="max-w-2xl space-y-6">

        {/* 계정 정보 */}
        <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-gray-900">계정 정보</h2>
          </div>

          <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-0.5">이메일</p>
              <p className="font-medium text-gray-800">{session.user?.email ?? "-"}</p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-0.5">역할</p>
              <Badge variant="secondary">{ROLE_LABEL[session.user?.role ?? "ANALYST"]}</Badge>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="name" className="text-sm">이름</Label>
            <div className="flex gap-2">
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="이름을 입력하세요"
                className="flex-1"
              />
              <Button onClick={handleSaveName} disabled={savingName} size="sm" className="gap-1">
                <Save className="w-3.5 h-3.5" />
                {savingName ? "저장 중..." : "저장"}
              </Button>
            </div>
            {nameMsg && (
              <p className={`text-xs ${nameMsg.includes("되었") ? "text-green-600" : "text-red-500"}`}>
                {nameMsg}
              </p>
            )}
          </div>
        </div>

        {/* 비밀번호 변경 */}
        <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-gray-900">비밀번호 변경</h2>
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm">현재 비밀번호</Label>
              <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} placeholder="현재 비밀번호" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">새 비밀번호</Label>
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="8자 이상" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">새 비밀번호 확인</Label>
              <Input type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} placeholder="비밀번호 확인" />
            </div>
            {pwMsg && (
              <p className={`text-xs ${pwMsg.includes("변경") ? "text-green-600" : "text-red-500"}`}>
                {pwMsg}
              </p>
            )}
            <Button onClick={handleSavePw} disabled={savingPw} size="sm" className="w-full gap-1">
              {savingPw ? "변경 중..." : "비밀번호 변경"}
            </Button>
          </div>
        </div>

        {/* AI 에이전트 현황 */}
        <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-gray-900">AI 에이전트</h2>
            <span className="text-xs text-gray-400 ml-auto">Claude Sonnet (Anthropic)</span>
          </div>
          <div className="space-y-2">
            {AGENTS.map((agent) => (
              <div key={agent.name} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${agent.dot}`} />
                  <div>
                    <p className="font-medium text-sm">{agent.name}</p>
                    <p className="text-xs text-gray-500">{agent.desc}</p>
                  </div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 font-medium">활성</span>
              </div>
            ))}
          </div>
        </div>

        {/* 스토리지 */}
        <div className="bg-white border border-gray-100 rounded-xl p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-gray-500" />
            <h2 className="font-semibold text-gray-900">스토리지</h2>
          </div>
          <div className="flex justify-between text-sm text-gray-600">
            <span>스토리지 모드</span>
            <Badge variant="outline">로컬 / Supabase</Badge>
          </div>
          <p className="text-xs text-gray-400">프로덕션 배포 시 Supabase Storage로 자동 전환됩니다.</p>
        </div>

        {/* 로그아웃 */}
        <div className="bg-white border border-gray-100 rounded-xl p-6">
          <Button
            variant="outline"
            className="w-full gap-2 text-red-600 border-red-200 hover:bg-red-50"
            onClick={() => signOut({ callbackUrl: "/login" })}
          >
            <LogOut className="w-4 h-4" />
            로그아웃
          </Button>
        </div>

      </div>
    </AppLayout>
  );
}
