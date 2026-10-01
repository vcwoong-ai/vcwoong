"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Sidebar } from "./sidebar";
import { Header } from "./header";

interface AppLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function AppLayout({ children, title }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const pathname = usePathname();

  // 페이지가 바뀌면 드로어를 닫는다 (뒤로가기 등으로 이동한 경우 포함).
  useEffect(() => {
    setHydrated(true);
    setSidebarOpen(false);
  }, [pathname]);

  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setSidebarOpen(false); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);

  return (
    <div className="min-h-screen bg-background" data-app-ready={hydrated}>
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-background focus:px-4 focus:py-3 focus:text-foreground focus:outline focus:outline-2 focus:outline-primary">
        본문으로 이동
      </a>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      {/* 사이드바는 lg 이상에서만 자리를 차지한다. 모바일에서도 pl-64를 주면
          좁은 화면에서 본문 폭이 100px대로 줄어 글자가 세로로 깨진다. */}
      <div className="lg:pl-64">
        <Header title={title} menuOpen={sidebarOpen} onMenuClick={() => setSidebarOpen(true)} />
        <main id="main-content" tabIndex={-1} className="p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
