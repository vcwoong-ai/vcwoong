"use client";

import { useState } from "react";

export function ReinstallButton() {
  const [state, setState] = useState<"idle" | "busy" | "ok" | "err">("idle");
  const [msg, setMsg] = useState("");
  return (
    <span className="row">
      <button
        type="button"
        className="btn ghost sm"
        disabled={state === "busy"}
        onClick={async () => {
          setState("busy");
          const res = await fetch("/api/script/install", { method: "POST" });
          const json = await res.json().catch(() => ({}));
          if (res.ok) {
            setState("ok");
            setMsg("다시 설치했습니다.");
            setTimeout(() => location.reload(), 800);
          } else {
            setState("err");
            setMsg(json.error || "설치하지 못했습니다.");
          }
        }}
      >
        {state === "busy" ? "설치 중…" : "설문 스크립트 다시 설치"}
      </button>
      {msg && <span className={`status ${state === "err" ? "err" : "ok"}`}>{msg}</span>}
    </span>
  );
}

export function UpgradeButton({ price }: { price: number }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <span className="row">
      <button
        type="button"
        className="btn sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr("");
          const res = await fetch("/api/billing/upgrade", { method: "POST" });
          const json = await res.json().catch(() => ({}));
          if (res.ok && json.url) {
            location.href = json.url;
          } else {
            setBusy(false);
            setErr(json.error || "결제 화면을 열지 못했습니다.");
          }
        }}
      >
        {busy ? "결제 화면 여는 중…" : `Pro로 업그레이드 (월 ${price.toLocaleString("ko-KR")}원)`}
      </button>
      {err && <span className="status err">{err}</span>}
    </span>
  );
}
