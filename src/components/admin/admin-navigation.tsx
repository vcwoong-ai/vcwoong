"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

const items = [
  { href: "/admin", label: "운영 홈" },
  { href: "/admin/demo", label: "데모 검토" },
  { href: "/admin/usage-cost", label: "AI 비용" },
];

export function AdminNavigation() {
  const pathname = usePathname();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav aria-label="운영자 메뉴" className="flex flex-wrap gap-2">
        {items.map((item) => {
          const active = item.href === "/admin"
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link key={item.href} href={item.href} aria-current={active ? "page" : undefined}
              className={`rounded-md px-3 py-2 text-sm font-medium ${active
                ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <Button variant="ghost" size="sm" onClick={() => signOut({ callbackUrl: "/login" })}>
        로그아웃
      </Button>
    </div>
  );
}
