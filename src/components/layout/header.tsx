"use client";

import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Bell, LogOut, User, Menu } from "lucide-react";
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

interface HeaderProps {
  title?: string;
  /** 모바일 햄버거 버튼 (lg 미만에서만 노출) */
  onMenuClick?: () => void;
}

export function Header({ title, onMenuClick }: HeaderProps) {
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
    <header className="h-16 border-b border-gray-200 bg-white flex items-center justify-between px-4 sm:px-6 gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden flex-shrink-0"
          onClick={onMenuClick}
          aria-label="메뉴 열기"
        >
          <Menu className="w-5 h-5" />
        </Button>
        {title && (
          <h2 className="text-base sm:text-lg font-semibold text-gray-900 truncate">
            {title}
          </h2>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-3 flex-shrink-0">
        <Button variant="ghost" size="icon" className="relative hidden sm:inline-flex">
          <Bell className="w-4 h-4" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="flex items-center gap-2 h-9">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-blue-600 text-white text-xs font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-medium text-gray-900">
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
