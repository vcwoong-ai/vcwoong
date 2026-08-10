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
          "fixed left-0 top-0 h-screen w-64 bg-slate-900 text-white flex flex-col z-50",
          "overflow-y-auto transition-transform duration-200 lg:transition-none",
          // 모바일에서는 기본으로 화면 밖에 두고, 열었을 때만 밀어 넣는다.
          // 항상 보이게 두면 좁은 화면에서 본문이 100px대로 찌그러진다.
          open ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0"
        )}
      >
      {/* Logo */}
      <div className="p-6 border-b border-slate-700 flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center flex-shrink-0">
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
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              // 모바일에서 메뉴를 고르면 드로어가 닫혀야 이동한 화면이 보인다.
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150",
                isActive
                  ? "bg-blue-600 text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span>{item.label}</span>
              {isActive && (
                <ChevronRight className="w-3 h-3 ml-auto opacity-70" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Agent badges */}
      <div className="p-4 border-t border-slate-700">
        <p className="text-xs text-slate-500 mb-2 font-medium uppercase tracking-wider">
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
              <div className={`w-1.5 h-1.5 rounded-full ${agent.dot}`} />
              <span>{agent.name}</span>
            </div>
          ))}
        </div>
      </div>
      </aside>
    </>
  );
}
