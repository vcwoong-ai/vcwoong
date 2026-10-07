import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { requirePlatformAdmin } from "@/lib/platform-admin-server";
import { AdminNavigation } from "@/components/admin/admin-navigation";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "운영자 페이지",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#admin-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-background focus:p-3">
        본문으로 이동
      </a>
      <header className="border-b bg-card">
        <div className="mx-auto max-w-6xl space-y-4 px-4 py-5 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href="/admin" className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden="true" />
              {BRAND.name} <span className="font-normal text-muted-foreground">운영자</span>
            </Link>
            <Link href="/dashboard" className="text-sm text-muted-foreground hover:text-foreground">
              내 워크스페이스로 이동
            </Link>
          </div>
          <AdminNavigation />
        </div>
      </header>
      <main id="admin-content" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}
