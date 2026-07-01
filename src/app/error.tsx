"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="text-center max-w-md">
        <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">문제가 발생했습니다</h2>
        <p className="text-gray-500 text-sm mb-6">
          {error.message || "일시적인 오류입니다. 잠시 후 다시 시도해 주세요."}
        </p>
        <div className="flex gap-3 justify-center">
          <Button onClick={reset}>다시 시도</Button>
          <Button variant="outline" onClick={() => (window.location.href = "/dashboard")}>
            대시보드로
          </Button>
        </div>
      </div>
    </div>
  );
}
