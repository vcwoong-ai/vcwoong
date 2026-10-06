"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { LogOut, User, Menu } from "lucide-react";
import { NotificationBell } from "@/components/layout/notification-bell";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import styles from "./workspace-shell.module.css";

interface HeaderProps {
  title?: string;
  /** 모바일 햄버거 버튼 (lg 미만에서만 노출) */
  onMenuClick?: () => void;
  menuOpen?: boolean;
}

export function Header({ title, onMenuClick, menuOpen = false }: HeaderProps) {
  const { data: session } = useSession();

  const initials = session?.user?.name
    ? session.user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : "??";

  const roleLabel: Record<string, string> = {
    ADMIN: "관리자",
    PARTNER: "파트너",
    ANALYST: "심사역",
  };

  return (
    <header
      className={styles.header}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden flex-shrink-0"
          onClick={onMenuClick}
          id="workspace-menu-trigger"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? "workspace-mobile-menu" : undefined}
          aria-label="메뉴 열기"
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div className="min-w-0">
          <p className={styles.headerEyebrow}>INVESTMENT DESK</p>
          {title && <h2 className={styles.headerTitle}>{title}</h2>}
        </div>
      </div>

      <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
        <NotificationBell />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className={styles.accountButton} aria-label="계정 메뉴">
              <Avatar className="h-7 w-7">
                <AvatarFallback className={styles.avatar}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="text-left hidden sm:block">
                <p className={styles.accountName}>
                  {session?.user?.name ?? "사용자"}
                </p>
                <p className="text-xs text-gray-500">
                  {roleLabel[session?.user?.role ?? "ANALYST"]}
                </p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>
              <div>
                <p className="font-medium">{session?.user?.name}</p>
                <p className="text-xs text-gray-500 font-normal">
                  {session?.user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings" className="flex items-center cursor-pointer">
                <User className="w-4 h-4 mr-2" />
                설정
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-red-600 focus:text-red-600"
              onClick={() => signOut({ callbackUrl: "/login" })}
            >
              <LogOut className="w-4 h-4 mr-2" />
              로그아웃
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
