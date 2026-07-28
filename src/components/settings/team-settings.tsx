"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users, UserPlus, LogOut } from "lucide-react";

interface TeamMember {
  id: string;
  name: string | null;
  email: string | null;
  role: string;
}

interface TeamData {
  id: string;
  name: string;
  users: TeamMember[];
  _count: { deals: number; templates: number };
}

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "관리자",
  PARTNER: "파트너",
  ANALYST: "심사역",
};

export function TeamSettings({
  userId,
  canUseTeam,
}: {
  userId: string;
  canUseTeam: boolean;
}) {
  const [team, setTeam] = useState<TeamData | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamName, setTeamName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/team");
      if (!res.ok) throw new Error("팀 정보를 불러올 수 없습니다");
      const json = await res.json();
      setTeam(json.data);
      if (json.data?.name) setTeamName(json.data.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (canUseTeam) load();
    else setLoading(false);
  }, [canUseTeam]);

  const createTeam = async () => {
    if (!teamName.trim()) return alert("팀 이름을 입력하세요");
    setBusy(true);
    try {
      const res = await fetch("/api/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: teamName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "팀 생성 실패");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "팀 생성 실패");
    } finally {
      setBusy(false);
    }
  };

  const renameTeam = async () => {
    if (!teamName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/team", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: teamName.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "이름 변경 실패");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "이름 변경 실패");
    } finally {
      setBusy(false);
    }
  };

  const inviteMember = async () => {
    if (!inviteEmail.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/team/members", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "초대 실패");
      setInviteEmail("");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "초대 실패");
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (memberId: string, role: string) => {
    setBusy(true);
    try {
      const res = await fetch("/api/team/members/role", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: memberId, role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "역할 변경 실패");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "역할 변경 실패");
    } finally {
      setBusy(false);
    }
  };

  const removeMember = async (memberId: string) => {
    if (!confirm("팀에서 제거하시겠습니까?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/team/members", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: memberId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "제거 실패");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "제거 실패");
    } finally {
      setBusy(false);
    }
  };

  if (!canUseTeam) {
    return (
      <p className="text-sm text-gray-500">
        팀 협업은 Multi-Sector 플랜부터 사용할 수 있습니다. 딜·양식을 팀원과
        공유하고 함께 심사할 수 있습니다.
      </p>
    );
  }

  if (loading) {
    return <p className="text-sm text-gray-400">팀 정보 불러오는 중...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  if (!team) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          팀을 만들면 딜·양식을 팀원과 공유할 수 있습니다.
        </p>
        <div className="space-y-2">
          <Label htmlFor="new-team-name">팀 이름</Label>
          <Input
            id="new-team-name"
            value={teamName}
            onChange={(e) => setTeamName(e.target.value)}
            placeholder="예: Axiom 투자 1팀"
          />
        </div>
        <Button onClick={createTeam} disabled={busy}>
          {busy ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          팀 만들기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Users className="w-4 h-4 text-gray-500" />
        <span className="font-medium">{team.name}</span>
        <Badge variant="secondary">{team.users.length}명</Badge>
      </div>

      <div className="flex gap-2">
        <Input
          value={teamName}
          onChange={(e) => setTeamName(e.target.value)}
          className="max-w-xs"
        />
        <Button variant="outline" size="sm" onClick={renameTeam} disabled={busy}>
          이름 변경
        </Button>
      </div>

      <div className="text-xs text-gray-500 space-y-1">
        <p>공유 딜 {team._count.deals}건 · 공유 양식 {team._count.templates}개</p>
        <p>
          권한: 심사역=조회 · 파트너=편집 · 관리자=멤버/역할 관리 · 삭제·공유는 소유자만
        </p>
      </div>

      <div className="space-y-2">
        <Label>멤버</Label>
        <div className="divide-y border rounded-lg">
          {team.users.map((m) => (
            <div
              key={m.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <div>
                <span className="font-medium">{m.name ?? m.email}</span>
                {m.email && m.name && (
                  <span className="text-gray-400 ml-2">{m.email}</span>
                )}
                <Badge variant="outline" className="ml-2 text-xs">
                  {ROLE_LABEL[m.role] ?? m.role}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                {m.id !== userId && (
                  <select
                    className="text-xs border rounded px-1.5 py-1 bg-white"
                    value={m.role}
                    disabled={busy}
                    onChange={(e) => changeRole(m.id, e.target.value)}
                    title="역할 변경 (관리자)"
                  >
                    <option value="ANALYST">심사역 (조회)</option>
                    <option value="PARTNER">파트너 (편집)</option>
                    <option value="ADMIN">관리자</option>
                  </select>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-gray-500"
                  onClick={() => removeMember(m.id)}
                  disabled={busy}
                >
                  {m.id === userId ? (
                    <>
                      <LogOut className="w-3 h-3 mr-1" /> 나가기
                    </>
                  ) : (
                    "제거"
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2 pt-2 border-t">
        <Label htmlFor="invite-email">멤버 초대 (가입된 이메일)</Label>
        <div className="flex gap-2">
          <Input
            id="invite-email"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="colleague@firm.com"
          />
          <Button onClick={inviteMember} disabled={busy}>
            <UserPlus className="w-4 h-4 mr-1" />
            초대
          </Button>
        </div>
      </div>
    </div>
  );
}
