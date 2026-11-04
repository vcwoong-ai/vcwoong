"use client";

import { useState } from "react";
import type { Survey, SurveyOption } from "@/lib/survey";

function newId() {
  return `opt_${Math.random().toString(36).slice(2, 10)}`;
}

export function SurveyEditor({ initial }: { initial: Survey }) {
  const [s, setS] = useState<Survey>(initial);
  const [status, setStatus] = useState<{ kind: "idle" | "ok" | "err" | "busy"; text: string }>({ kind: "idle", text: "" });

  const update = (patch: Partial<Survey>) => {
    setS((prev) => ({ ...prev, ...patch }));
    setStatus({ kind: "idle", text: "" });
  };
  const setOption = (i: number, label: string) => update({ options: s.options.map((o, j) => (j === i ? { ...o, label } : o)) });
  const move = (i: number, d: -1 | 1) => {
    const next = s.options.slice();
    const [item] = next.splice(i, 1);
    next.splice(i + d, 0, item);
    update({ options: next });
  };

  async function save() {
    setStatus({ kind: "busy", text: "저장 중…" });
    const body: Survey = { ...s, options: s.options.map((o: SurveyOption) => ({ id: o.id, label: o.label.trim() })) };
    const res = await fetch("/api/survey", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (res.ok) setStatus({ kind: "ok", text: "저장했습니다. 다음 주문부터 바뀐 설문이 보입니다." });
    else setStatus({ kind: "err", text: json.error || "저장하지 못했습니다." });
  }

  return (
    <section className="card" aria-labelledby="ed">
      <div className="card-head">
        <h2 id="ed">설문 설정</h2>
        <span className={`pill ${s.enabled ? "ok" : "warn"}`}>{s.enabled ? "고객에게 표시 중" : "꺼짐"}</span>
      </div>
      <div className="grid2">
        <div style={{ display: "flex", flexDirection: "column", gap: 12, minWidth: 0 }}>
          <label className="field" htmlFor="q">
            <span>질문</span>
            <input id="q" className="input" value={s.question} maxLength={80} onChange={(e) => update({ question: e.target.value })} />
          </label>
          <div className="field">
            <span>보기 ({s.options.length}/12)</span>
            {s.options.map((o, i) => (
              <div className="opt-row" key={o.id}>
                <input
                  id={`opt-${o.id}`}
                  className="input"
                  aria-label={`보기 ${i + 1}`}
                  value={o.label}
                  maxLength={30}
                  onChange={(e) => setOption(i, e.target.value)}
                />
                <button type="button" className="icon" aria-label="위로" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
                <button type="button" className="icon" aria-label="아래로" disabled={i === s.options.length - 1} onClick={() => move(i, 1)}>↓</button>
                <button type="button" className="icon" aria-label="삭제" disabled={s.options.length <= 2} onClick={() => update({ options: s.options.filter((_, j) => j !== i) })}>×</button>
              </div>
            ))}
            <div className="row">
              <button
                type="button"
                className="btn ghost sm"
                disabled={s.options.length >= 12}
                onClick={() => update({ options: [...s.options, { id: newId(), label: "" }] })}
              >
                + 보기 추가
              </button>
            </div>
          </div>
          <div className="switches">
            <label className="switch" htmlFor="sw-other">
              <input id="sw-other" type="checkbox" checked={s.allow_other} onChange={(e) => update({ allow_other: e.target.checked })} />
              &lsquo;기타 (직접 입력)&rsquo; 보기 보여주기
            </label>
            <label className="switch" htmlFor="sw-rand">
              <input id="sw-rand" type="checkbox" checked={s.randomize} onChange={(e) => update({ randomize: e.target.checked })} />
              보기 순서 섞기 (첫 번째 보기에 응답이 몰리는 것을 막습니다)
            </label>
            <label className="switch" htmlFor="sw-on">
              <input id="sw-on" type="checkbox" checked={s.enabled} onChange={(e) => update({ enabled: e.target.checked })} />
              주문 완료 화면에 설문 표시
            </label>
          </div>
          <div className="row">
            <button type="button" className="btn" onClick={save} disabled={status.kind === "busy"}>저장</button>
            {status.text && <span className={`status ${status.kind === "err" ? "err" : status.kind === "ok" ? "ok" : ""}`}>{status.text}</span>}
          </div>
        </div>
        <div className="field">
          <span>고객에게 보이는 모습</span>
          <div className="preview" aria-hidden>
            <div className="preview-card">
              <p className="preview-q">{s.question || "질문을 입력하세요"}</p>
              <div className="preview-grid">
                {s.options.map((o) => <span key={o.id}>{o.label || "…"}</span>)}
                {s.allow_other && <span>기타</span>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
