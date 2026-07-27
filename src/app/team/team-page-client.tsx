"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Copy,
  Loader2,
  LogOut,
  Mail,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

interface Member {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
}

interface Invite {
  id: string;
  email: string;
  code: string;
  expiresAt: string;
}

interface TeamView {
  id: string;
  name: string;
  ownerId: string;
  isOwner: boolean;
  members: Member[];
  invites: Invite[];
  sharedDeals: number;
  sharedTemplates: number;
}

export function TeamPageClient({
  currentUserId,
  planAllowed,
  lockMessage,
}: {
  currentUserId: string;
  planAllowed: boolean;
  lockMessage: string;
}) {
  const [team, setTeam] = useState<TeamView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [teamName, setTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [joinCode, setJoinCode] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/team");
      const json = await res.json();
      setTeam(json.data?.team ?? null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const call = async (
    url: string,
    method: string,
    body?: Record<string, unknown>
  ) => {
    setBusy(true);
    try {
      const res = await fetch(url, {
        method,
        ...(body
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
          : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "요청 실패");
      await load();
      return json;
    } catch (e) {
      alert(e instanceof Error ? e.message : "요청 실패");
      return null;
    } finally {
      setBusy(false);
    }
  };

  const createTeam = async () => {
    if (!teamName.trim()) return alert("팀 이름을 입력하세요");
    const ok = await call("/api/team", "POST", { name: teamName.trim() });
    if (ok) setTeamName("");
  };

  const invite = async () => {
    if (!inviteEmail.trim()) return alert("초대할 이메일을 입력하세요");
    const ok = await call("/api/team/invites", "POST", { email: inviteEmail.trim() });
    if (ok) setInviteEmail("");
  };

  const join = async () => {
    if (!joinCode.trim()) return alert("초대 코드를 입력하세요");
    const ok = await call("/api/team/join", "POST", { code: joinCode.trim() });
    if (ok) setJoinCode("");
  };

  const leave = async () => {
    const message = team?.isOwner
      ? "팀을 해산하면 모든 공유가 해제됩니다. 계속할까요?"
      : "팀에서 나가면 내가 공유한 딜·양식의 공유가 해제됩니다. 계속할까요?";
    if (!confirm(message)) return;
    await call("/api/team", "DELETE");
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-16 text-center text-sm text-gray-400">
          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
          팀 정보를 불러오는 중...
        </CardContent>
      </Card>
    );
  }

  // ── 팀 없음 ────────────────────────────────────────
  if (!team) {
    return (
      <div className="max-w-lg mx-auto py-6 space-y-4">
        {!planAllowed && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            {lockMessage}{" "}
            <Link href="/pricing" className="underline font-medium">
              플랜 보기
            </Link>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4" />팀 만들기
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-500">
              팀을 만들면 딜과 양식을 팀원과 공유할 수 있습니다.
            </p>
            <div>
              <Label htmlFor="team-name">팀 이름</Label>
              <Input
                id="team-name"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="예: 그로쓰 심사본부"
                disabled={!planAllowed}
              />
            </div>
            <Button
              onClick={createTeam}
              disabled={busy || !planAllowed}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}팀 만들기
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              초대 코드로 합류
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-gray-500">
              팀 소유자에게 받은 초대 코드를 입력하세요.
            </p>
            <Input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value)}
              placeholder="초대 코드"
              className="font-mono"
            />
            <Button onClick={join} disabled={busy} variant="outline" className="w-full">
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}합류하기
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── 팀 있음 ────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{team.name}</h1>
          <p className="text-sm text-gray-500 mt-1">
            딜·양식 상세 화면에서 <strong>팀 공유</strong>를 켜면 팀원 전체가 열람하고
            편집할 수 있습니다.
          </p>
        </div>
        <Button variant="outline" onClick={leave} disabled={busy}>
          <LogOut className="w-4 h-4 mr-2" />
          {team.isOwner ? "팀 해산" : "팀 나가기"}
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "팀원", value: `${team.members.length}명` },
          { label: "대기 중 초대", value: `${team.invites.length}건` },
          { label: "공유된 딜", value: `${team.sharedDeals}건` },
          { label: "공유된 양식", value: `${team.sharedTemplates}개` },
        ].map((c) => (
          <Card key={c.label}>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-gray-400">{c.label}</p>
              <p className="text-lg font-bold text-gray-900 mt-0.5">{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">팀원</CardTitle>
        </CardHeader>
        <CardContent className="divide-y">
          {team.members.map((m) => (
            <div key={m.id} className="flex items-center justify-between py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {m.name ?? m.email ?? "이름 없음"}
                  {m.id === currentUserId && (
                    <span className="text-xs text-gray-400 ml-2">(나)</span>
                  )}
                </p>
                <p className="text-xs text-gray-500">{m.email}</p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {m.id === team.ownerId ? "소유자" : m.role}
                </Badge>
                {team.isOwner && m.id !== team.ownerId && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      if (confirm(`${m.email} 님을 팀에서 제외할까요?`)) {
                        call(`/api/team/members/${m.id}`, "DELETE");
                      }
                    }}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {team.isOwner && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="w-4 h-4" />팀원 초대
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@vc.kr"
                type="email"
              />
              <Button
                onClick={invite}
                disabled={busy}
                className="bg-blue-600 hover:bg-blue-700 shrink-0"
              >
                {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                초대 코드 발급
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              발급된 코드를 상대방에게 전달하세요. 같은 이메일로 가입한 사용자만
              합류할 수 있습니다.
            </p>

            {team.invites.length > 0 && (
              <div className="border rounded-lg divide-y">
                {team.invites.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center justify-between gap-3 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-gray-800 truncate">{i.email}</p>
                      <p className="text-xs text-gray-400">
                        만료 {new Date(i.expiresAt).toLocaleDateString("ko-KR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <code className="text-xs bg-gray-100 rounded px-2 py-1 font-mono">
                        {i.code}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigator.clipboard.writeText(i.code)}
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          call("/api/team/invites", "DELETE", { inviteId: i.id })
                        }
                        className="text-gray-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
