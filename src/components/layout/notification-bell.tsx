"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Bell, AlertTriangle, Info, Loader2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Alert {
  companyId: string;
  companyName: string;
  severity: "high" | "medium";
  message: string;
}

/**
 * 헤더 알림 벨.
 *
 * 원래는 아이콘만 있고 눌러도 아무 일이 없었다 — 눌리게 생겼는데 반응이
 * 없는 버튼은 "고장 났나?" 싶게 만드는, 티 안 나지만 확실한 신뢰 손상
 * 요소라 실제 포트폴리오 알림에 연결했다.
 */
export function NotificationBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [total, setTotal] = useState(0);
  const [highCount, setHighCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      if (!res.ok) return; // 조용히 실패 — 헤더에서 에러를 띄울 자리가 아니다
      const { data } = await res.json();
      setAlerts(data?.alerts ?? []);
      setTotal(data?.total ?? 0);
      setHighCount(data?.highCount ?? 0);
    } catch {
      /* 네트워크 문제로 헤더가 깨지지 않게 무시 */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={total > 0 ? `알림 ${total}건` : "알림"}
        >
          <Bell className="w-4 h-4" />
          {total > 0 && (
            <span
              className={cn(
                "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1",
                "flex items-center justify-center rounded-full",
                "text-[10px] font-bold text-white tabular-nums",
                highCount > 0 ? "bg-red-500" : "bg-amber-500"
              )}
            >
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <DropdownMenuLabel className="flex items-center justify-between px-4 py-3">
          <span>포트폴리오 알림</span>
          {total > 0 && (
            <span className="text-xs font-normal text-gray-500 tabular-nums">
              {total}건
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="m-0" />

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-gray-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            불러오는 중...
          </div>
        ) : alerts.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-gray-500">확인할 알림이 없습니다</p>
            <p className="text-xs text-gray-400 mt-1">
              마일스톤 지연·런웨이 부족이 생기면 여기에 표시됩니다
            </p>
          </div>
        ) : (
          <>
            <ul className="max-h-80 overflow-y-auto py-1">
              {alerts.map((a, i) => {
                const Icon = a.severity === "high" ? AlertTriangle : Info;
                return (
                  <li key={`${a.companyId}-${i}`}>
                    <Link
                      href={`/portfolio/${a.companyId}`}
                      className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-gray-50 transition-colors"
                    >
                      <Icon
                        className={cn(
                          "w-4 h-4 mt-0.5 flex-shrink-0",
                          a.severity === "high"
                            ? "text-red-500"
                            : "text-amber-500"
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {a.companyName}
                        </p>
                        <p className="text-xs text-gray-500 leading-relaxed">
                          {a.message}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
            <DropdownMenuSeparator className="m-0" />
            <Link
              href="/portfolio"
              className="block px-4 py-2.5 text-center text-xs font-medium text-blue-600 hover:bg-gray-50 transition-colors"
            >
              포트폴리오 전체 보기
            </Link>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
