"use client";

import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

interface TopBarProps {
  title: string;
  subtitle?: string;
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export default function TopBar({ title, subtitle, action }: TopBarProps) {
  return (
    <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-border">
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="flex items-center gap-3">
        {action && (
          action.href ? (
            <Link href={action.href}>
              <Button size="sm" className="bg-[#1B4FD8] hover:bg-[#1540B0] gap-1.5">
                <Plus className="w-4 h-4" />
                {action.label}
              </Button>
            </Link>
          ) : (
            <Button size="sm" onClick={action.onClick} className="bg-[#1B4FD8] hover:bg-[#1540B0] gap-1.5">
              <Plus className="w-4 h-4" />
              {action.label}
            </Button>
          )
        )}
      </div>
    </header>
  );
}
