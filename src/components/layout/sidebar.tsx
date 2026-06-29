"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Upload,
  Settings,
  ChevronRight,
  Zap,
  LayoutTemplate,
} from "lucide-react";

const navItems = [
  { label: "대시보드", href: "/dashboard", icon: LayoutDashboard },
  { label: "딜 관리", href: "/deals", icon: Briefcase },
  { label: "보고서", href: "/reports", icon: FileText },
  { label: "양식 관리", href: "/dashboard/templates/new", icon: LayoutTemplate },
  { label: "LP 리포팅", href: "/lp-report", icon: FileText },
  { label: "파일 업로드", href: "/upload", icon: Upload },
  { label: "설정", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-slate-900 text-white flex flex-col z-40">
      {/* Logo */}
      <div className="p-6 border-b border-slate-700">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight">DealSync</h1>
            <p className="text-xs text-slate-400">AI 투자심의 자동화</p>
          </div>
        </div>
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
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
            <span>General Agent</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-1.5 h-1.5 rounded-full bg-purple-400" />
            <span>Dr. Cell (Bio)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            <span>Code (IT/SaaS)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-1.5 h-1.5 rounded-full bg-yellow-400" />
            <span>Neuron (AI/딥테크)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            <span>Maker (제조)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-1.5 h-1.5 rounded-full bg-pink-400" />
            <span>Story (콘텐츠)</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span>Vault (핀테크)</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
