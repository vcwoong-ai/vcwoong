"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Users } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function TeamShareToggle({
  type,
  resourceId,
  teamId,
  shared,
  isOwner,
  canUseTeam,
}: {
  type: "deal" | "template" | "fund" | "portfolio" | "inbound";
  resourceId: string;
  teamId: string | null;
  shared: boolean;
  isOwner: boolean;
  canUseTeam: boolean;
}) {
  const toast = useToast();
  const [isShared, setIsShared] = useState(shared);
  const [busy, setBusy] = useState(false);

  if (!canUseTeam || !teamId || !isOwner) {
    if (isShared && teamId) {
      return (
        <Badge variant="secondary" className="gap-1">
          <Users className="w-3 h-3" />
          팀 공유됨
        </Badge>
      );
    }
    return null;
  }

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/team/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, id: resourceId, share: !isShared }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "공유 설정 실패");
      setIsShared(!isShared);
    } catch (e) {
      toast.error("공유 설정 실패", {
        description: e instanceof Error ? e.message : "다시 시도해 주세요",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant={isShared ? "default" : "outline"}
      size="sm"
      onClick={toggle}
      disabled={busy}
      className={isShared ? "bg-blue-600 hover:bg-blue-700" : ""}
    >
      {busy ? (
        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
      ) : (
        <Users className="w-3.5 h-3.5 mr-1.5" />
      )}
      {isShared ? "팀 공유 중" : "팀과 공유"}
    </Button>
  );
}
