"use client";

import { useEffect } from "react";

/**
 * 루트 레이아웃 자체가 터졌을 때의 마지막 방어선.
 *
 * error.tsx는 레이아웃 안에서 렌더되므로 레이아웃이 깨지면 잡지 못한다.
 * 이 파일은 자체 <html>/<body>를 렌더해야 하고, 레이아웃의 CSS를 못 쓰는
 * 상황일 수 있어 스타일을 인라인으로 둔다.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[GlobalError]", error);
  }, [error]);

  return (
    <html lang="ko">
      <body
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily:
            "system-ui, -apple-system, 'Malgun Gothic', sans-serif",
          background: "#f9fafb",
          margin: 0,
          padding: "0 24px",
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 420 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: "#111827", margin: "0 0 8px" }}>
            문제가 발생했습니다
          </h2>
          <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 24px" }}>
            잠시 후 다시 시도해 주세요. 문제가 계속되면 관리자에게 문의해 주세요.
            {error.digest ? ` (오류 코드: ${error.digest})` : ""}
          </p>
          <button
            onClick={reset}
            style={{
              padding: "8px 16px",
              borderRadius: 6,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              fontSize: 14,
              cursor: "pointer",
            }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
