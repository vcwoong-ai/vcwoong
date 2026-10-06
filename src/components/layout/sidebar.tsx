"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cn } from "@/lib/utils";
import { BRAND } from "@/lib/brand";
import styles from "./workspace-shell.module.css";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  Inbox,
  Upload,
  Settings,
  Zap,
  LayoutTemplate,
  LineChart,
  Sparkles,
  Landmark,
  X,
} from "lucide-react";

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

/**
 * VC와 PE는 한 플랫폼 안의 두 워크스페이스다 — 같은 셸을 쓰되 메뉴에서 어느
 * 워크스페이스에 있는지 분명히 구분한다. 화면을 억지로 똑같이 만들지 않고
 * 도메인별 정보 구조는 그대로 둔다.
 */
const navGroups: Array<{ heading: string | null; items: NavItem[] }> = [
  { heading: null, items: [{ label: "대시보드", href: "/dashboard", icon: LayoutDashboard }] },
  {
    heading: "VC 워크스페이스",
    items: [
      { label: "딜소싱", href: "/sourcing", icon: Inbox },
      { label: "딜 관리", href: "/deals", icon: Briefcase },
      { label: "보고서", href: "/reports", icon: FileText },
      { label: "보고서 생성", href: "/reports/new", icon: Sparkles },
    ],
  },
  {
    heading: "PE/M&A 워크스페이스",
    items: [{ label: "PE/M&A 딜", href: "/ma-deals", icon: Landmark }],
  },
  {
    heading: "플랫폼",
    items: [
      { label: "양식 관리", href: "/templates", icon: LayoutTemplate },
      { label: "포트폴리오", href: "/portfolio", icon: LineChart },
      { label: "LP 리포팅", href: "/lp-report", icon: FileText },
      { label: "파일 업로드", href: "/upload", icon: Upload },
      { label: "설정", href: "/settings", icon: Settings },
    ],
  },
];

const navItems: NavItem[] = navGroups.flatMap((g) => g.items);

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

  const content = (
    <>
      {/* Logo */}
      <div className={styles.brandBlock}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={styles.brandMark}>
            <Zap className="w-5 h-5" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className={styles.brandName}>{BRAND.name}</p>
            <p className={styles.brandCaption}>{BRAND.nameKr} · {BRAND.tagline}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className={cn("lg:hidden", styles.closeButton)}
          aria-label="메뉴 닫기"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Navigation */}
      <nav className={styles.navigation} aria-label="주 메뉴">
        {navGroups.map((group, gi) => (
          <div key={group.heading ?? `g${gi}`} role="group" aria-label={group.heading ?? undefined}>
            {group.heading && (
              <p className={styles.groupHeading}>
                {group.heading}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = isActiveHref(pathname, item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    // 모바일에서 메뉴를 고르면 드로어가 닫혀야 이동한 화면이 보인다.
                    onClick={onClose}
                    className={cn(
                      styles.navLink,
                      isActive && styles.navActive
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {/* 현재 화면을 금색 가장자리와 aria-current로 함께 표시한다. */}
                    {isActive && <span className={styles.activeMarker} aria-hidden="true" />}
                    <item.icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Available report specializations; these labels do not indicate runtime activity. */}
      <div className={styles.capabilities}>
        <p className={styles.capabilityHeading}>
          보고서 전문 분야
        </p>
        <div className={styles.capabilityList}>
          {["Dr. Cell", "Code", "Neuron", "Maker", "Story", "Vault"].map((name) => (
            <div key={name} className={styles.capabilityItem}>
              <span>{name}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  );

  return (
    <>
      <aside className={cn("fixed left-0 top-0 z-50 hidden h-screen w-64 flex-col overflow-y-auto lg:flex", styles.sidebar)}>
        {content}
      </aside>
      <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose?.(); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/50 lg:hidden" />
          <DialogPrimitive.Content
            id="workspace-mobile-menu"
            className={cn("fixed inset-y-0 left-0 z-50 flex w-64 max-w-[calc(100%-2rem)] flex-col overflow-y-auto lg:hidden", styles.sidebar)}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              document.getElementById("workspace-menu-trigger")?.focus();
            }}
          >
            <DialogPrimitive.Title className="sr-only">워크스페이스 메뉴</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">VC, PE/M&A와 플랫폼 화면으로 이동합니다.</DialogPrimitive.Description>
            {content}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
