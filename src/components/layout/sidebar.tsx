"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Inbox,
  Upload,
  Settings,
  ChevronRight,
  Zap,
  LayoutTemplate,
  LineChart,
  Sparkles,
  X,
} from "lucide-react";

const navItems = [
  {
    label: "대시보드",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    label: "딜소싱",
    href: "/sourcing",
    icon: Inbox,
  },
  {
    label: "딜 관리",
    href: "/deals",
    icon: Briefcase,
  },
  {
    label: "보고서",
    href: "/reports",
    icon: FileText,
  },
  {
    label: "보고서 생성",
    href: "/reports/new",
    icon: Sparkles,
  },
  {
    label: "양식 관리",
    href: "/templates",
    icon: LayoutTemplate,
  },
  {
    label: "포트폴리오",
    href: "/portfolio",
    icon: LineChart,
  },
  {
    label: "LP 리포팅",
    href: "/lp-report",
    icon: FileText,
  },
  {
    label: "파일 업로드",
    href: "/upload",
    icon: Upload,
  },
  {
    label: "설정",
    href: "/settings",
    icon: Settings,
  },
];

/**
 * 어떤 메뉴를 활성 표시할지 정한다.
 *
 * 단순 prefix 매칭(`startsWith(href + "/")`)이면 `/reports/new`에 있을 때
 * "보고서"와 "보고서 생성"이 **동시에** 파랗게 켜진다 — `/reports/new`가
 * `/reports/`로 시작하기 때문. 그래서 더 긴(= 더 구체적인) 메뉴가 이미
 * 매칭됐다면 짧은 쪽은 양보하게 한다.
 */
export function isActiveHref(pathname: string, href: string): boolean {
  const matches = (h: string) => pathname === h || pathname.startsWith(h + "/");
  if (!matches(href)) return false;

  // 나보다 더 구체적으로 맞는 메뉴가 있으면 그쪽이 활성이다.
  return !navItems.some(
    (other) =>
      other.href !== href &&
      other.href.length > href.length &&
      matches(other.href)
  );
}

interface SidebarProps {
  /** 모바일 드로어 열림 상태 (데스크톱에서는 무시된다) */
  open?: boolean;
  onClose?: () => void;
}

export function Sidebar({ open = false, onClose }: SidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* 모바일 드로어가 열렸을 때의 배경 (탭하면 닫힘) */}
      {open && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          // 단색 대신 아주 옅은 그라데이션 — 큰 남색 면이 밋밋해 보이는 걸 덜어준다
          "fixed left-0 top-0 h-screen w-64 z-50 flex flex-col text-white",
          "bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950",
          "border-r border-white/5",
          "overflow-y-auto transition-transform duration-200 lg:transition-none",
          // 모바일에서는 기본으로 화면 밖에 두고, 열었을 때만 밀어 넣는다.
          // 항상 보이게 두면 좁은 화면에서 본문이 100px대로 찌그러진다.
          open ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0"
        )}
      >
      {/* Logo */}
      <div className="p-6 border-b border-white/10 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br from-blue-500 to-blue-600 shadow-lg shadow-blue-500/25">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold tracking-tight">{BRAND.name}</h1>
            <p className="text-xs text-slate-400 truncate">{BRAND.nameKr} · {BRAND.tagline}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden text-slate-400 hover:text-white p-1 -mr-1 flex-shrink-0"
          aria-label="메뉴 닫기"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = isActiveHref(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              // 모바일에서 메뉴를 고르면 드로어가 닫혀야 이동한 화면이 보인다.
              onClick={onClose}
              className={cn(
                "group relative flex items-center gap-3 px-3 py-2.5 rounded-lg",
                "text-sm font-medium transition-colors duration-150",
                isActive
                  ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
                  : "text-slate-400 hover:bg-white/5 hover:text-white"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              {/* 활성 항목 왼쪽 하이라이트 바 — 배경색만으로 구분하는 것보다
                  어디에 있는지가 한눈에 들어온다 */}
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-white/90" />
              )}
              <item.icon
                className={cn(
                  "w-4 h-4 flex-shrink-0 transition-transform duration-150",
                  !isActive && "group-hover:scale-110"
                )}
              />
              <span>{item.label}</span>
              {isActive && (
                <ChevronRight className="w-3 h-3 ml-auto opacity-70" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Agent badges */}
      <div className="p-4 border-t border-white/10">
        <p className="text-[10px] text-slate-500 mb-2.5 font-semibold uppercase tracking-[0.12em]">
          활성 에이전트
        </p>
        <div className="space-y-1.5">
          {[
            { dot: "bg-purple-400", name: "Dr. Cell" },
            { dot: "bg-blue-400",   name: "Code" },
            { dot: "bg-cyan-400",   name: "Neuron" },
            { dot: "bg-orange-400", name: "Maker" },
            { dot: "bg-pink-400",   name: "Story" },
            { dot: "bg-emerald-400",name: "Vault" },
          ].map((agent) => (
            <div key={agent.name} className="flex items-center gap-2 text-xs text-slate-400">
              {/* 점 바깥으로 같은 색 후광을 줘서 '켜져 있다'는 느낌을 준다 */}
              <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
                <span
                  className={`absolute inline-flex h-full w-full rounded-full opacity-40 ${agent.dot}`}
                  style={{ transform: "scale(2)" }}
                />
                <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${agent.dot}`} />
              </span>
              <span>{agent.name}</span>
            </div>
          ))}
        </div>
      </div>
      </aside>
    </>
  );
}
