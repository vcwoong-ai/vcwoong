"use client";

import { SessionProvider } from "next-auth/react";
import { ToastProviderWithViewport } from "@/hooks/use-toast";
import { ConfirmProvider } from "@/hooks/use-confirm";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ToastProviderWithViewport>
        <ConfirmProvider>{children}</ConfirmProvider>
      </ToastProviderWithViewport>
    </SessionProvider>
  );
}
