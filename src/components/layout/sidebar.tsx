"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Settings,
  Zap,
  LayoutTemplate,
} from "lucide-react";

const navItems = [
  { label: "대시보드", href: "/dashboard", icon: LayoutDashboard },
  { label: "딜 관리", href: "/deals", icon: Briefcase },
  { label: "보고서", href: "/reports", icon: FileText },
  { label: "양식 관리", href: "/dashboard/templates", icon: LayoutTemplate },
  { label: "설정", href: "/settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-white border-r border-gray-100 flex flex-col z-40">
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-base font-bold text-gray-900 tracking-tight">DealSync</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-gray-100">
        <Link
          href="/reports/new"
          className="flex items-center justify-center gap-2 w-full px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md transition-colors"
        >
          <Zap className="w-3.5 h-3.5" />
          새 보고서
        </Link>
      </div>
    </aside>
  );
}
