"use client";

/**
 * 파괴적 동작(삭제·덮어쓰기) 확인 다이얼로그.
 *
 * 브라우저 기본 confirm()을 대체한다. confirm()은 스레드를 막아버리고
 * 생김새를 못 바꿔서, 딜 삭제처럼 되돌릴 수 없는 동작에 쓰기엔 위험 신호가
 * 너무 약했다(그냥 OS 팝업이라 무심코 확인 누르기 쉬움).
 *
 * Promise를 돌려주므로 기존 `if (!confirm(...)) return;` 자리에
 * `if (!(await confirm({...}))) return;` 으로 거의 그대로 바꿔 끼울 수 있다.
 */

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title: string;
  description?: string;
  /** 확인 버튼 문구. 기본 "확인" */
  confirmLabel?: string;
  cancelLabel?: string;
  /** 되돌릴 수 없는 동작이면 true — 확인 버튼이 빨간색이 된다 */
  destructive?: boolean;
}

type Resolver = (ok: boolean) => void;

const ConfirmContext = React.createContext<
  ((options: ConfirmOptions) => Promise<boolean>) | null
>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const resolverRef = React.useRef<Resolver | null>(null);

  const confirm = React.useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const settle = React.useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOptions(null);
  }, []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog
        open={options !== null}
        // ESC나 바깥 클릭으로 닫히면 "취소"로 본다 — 열어둔 채 방치되면
        // await가 영원히 안 풀려 버튼이 계속 로딩 상태로 남는다.
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title}</AlertDialogTitle>
            {options?.description && (
              <AlertDialogDescription className="whitespace-pre-line">
                {options.description}
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {options?.cancelLabel ?? "취소"}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={cn(
                options?.destructive &&
                  "bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-600"
              )}
            >
              {options?.confirmLabel ?? "확인"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) {
    throw new Error("useConfirm은 ConfirmProvider 안에서만 쓸 수 있습니다");
  }
  return ctx;
}
