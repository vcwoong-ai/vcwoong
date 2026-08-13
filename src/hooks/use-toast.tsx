"use client";

/**
 * 앱 전역 토스트.
 *
 * 기존에는 브라우저 기본 alert()로 성공·실패를 알렸는데, alert은 (1) 페이지를
 * 통째로 멈춰 세우고 (2) 브라우저마다 생김새가 제각각이라 제품이 조잡해
 * 보이는 가장 큰 원인이었다. 여기로 대체한다.
 *
 * 파괴적 동작 확인(삭제 등)은 토스트가 아니라 `ConfirmDialog`를 쓸 것 —
 * 토스트는 "알림"이지 "질문"이 아니다.
 */

import * as React from "react";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastIcon,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  type ToastVariant,
} from "@/components/ui/toast";

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastOptions {
  description?: string;
  /** 기본 4초. 실패 알림은 읽을 시간이 더 필요해 6초를 준다. */
  duration?: number;
}

interface ToastContextValue {
  toast: (title: string, options?: ToastOptions & { variant?: ToastVariant }) => void;
  success: (title: string, options?: ToastOptions) => void;
  error: (title: string, options?: ToastOptions) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

let counter = 0;
const nextId = () => `toast-${++counter}`;

export function ToastProviderWithViewport({
  children,
}: {
  children: React.ReactNode;
}) {
  const [items, setItems] = React.useState<ToastItem[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = React.useCallback(
    (title: string, variant: ToastVariant, options?: ToastOptions) => {
      const id = nextId();
      setItems((prev) => {
        const next: ToastItem = {
          id,
          title,
          description: options?.description,
          variant,
          duration: options?.duration ?? (variant === "destructive" ? 6000 : 4000),
        };
        // 화면을 토스트로 뒤덮지 않도록 최근 3개만 남긴다
        return [...prev, next].slice(-3);
      });
    },
    []
  );

  const value = React.useMemo<ToastContextValue>(
    () => ({
      toast: (title, options) =>
        push(title, options?.variant ?? "default", options),
      success: (title, options) => push(title, "success", options),
      error: (title, options) => push(title, "destructive", options),
      dismiss,
    }),
    [push, dismiss]
  );

  return (
    <ToastContext.Provider value={value}>
      <ToastProvider swipeDirection="right">
        {children}
        {items.map((item) => (
          <Toast
            key={item.id}
            variant={item.variant}
            duration={item.duration}
            onOpenChange={(open) => {
              if (!open) dismiss(item.id);
            }}
          >
            <ToastIcon variant={item.variant} />
            <div className="flex-1 min-w-0">
              <ToastTitle>{item.title}</ToastTitle>
              {item.description && (
                <ToastDescription>{item.description}</ToastDescription>
              )}
            </div>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast는 ToastProviderWithViewport 안에서만 쓸 수 있습니다");
  }
  return ctx;
}
