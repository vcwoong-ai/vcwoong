import { BRAND } from "@/lib/brand";
import { countOrders } from "@/lib/cafe24";
import { confirmUpgrade } from "@/lib/billing";
import { one, query } from "@/lib/db";
import { env } from "@/lib/env";
import { sessionMall } from "@/lib/http";
import { planState } from "@/lib/plan";
import { kstDate, summarize, type ResponseRow } from "@/lib/stats";
import { getSurvey } from "@/lib/survey";
import { ReinstallButton, UpgradeButton } from "./actions";
import { SurveyEditor } from "./editor";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90] as const;

function won(n: number) {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(n >= 1_000_000_000 ? 0 : 1)}억원`;
  if (n >= 10_000) return `${Math.round(n / 10_000).toLocaleString("ko-KR")}만원`;
  return `${n.toLocaleString("ko-KR")}원`;
}

function pct(x: number) {
  return `${(x * 100).toFixed(1)}%`;
}

export default async function Dashboard({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const mallId = sessionMall();
  if (!mallId) {
    return (
      <main className="page">
        <div className="card empty">
          <strong>카페24 관리자에서 앱을 열어 주세요</strong>
          카페24 관리자 &gt; 앱 &gt; 마이앱에서 {BRAND.name}을(를) 누르면 이 화면이 열립니다.
        </div>
      </main>
    );
  }

  const days = RANGES.includes(Number(searchParams.days) as (typeof RANGES)[number]) ? Number(searchParams.days) : 30;
  const since = new Date(Date.now() - days * 86400_000);

  // 결제 화면에서 돌아오지 못한 경우를 대비해 대기 중인 결제를 여기서 한 번 더 확인한다
  if (env.billingMode === "cafe24") {
    const pending = await query<{ order_id: string }>(
      `SELECT order_id FROM billing_orders WHERE mall_id = $1 AND status = 'pending' AND created_at > now() - interval '2 days'`,
      [mallId]
    );
    for (const p of pending) await confirmUpgrade(mallId, p.order_id).catch(() => false);
  }

  const [rows, survey, plan, mall, verifiedRow] = await Promise.all([
    query<ResponseRow>(
      `SELECT answer_label, other_text, amount, created_at FROM responses WHERE mall_id = $1 AND created_at >= $2 ORDER BY created_at DESC`,
      [mallId, since.toISOString()]
    ),
    getSurvey(mallId),
    planState(mallId),
    one<{ script_no: string | null }>(`SELECT script_no FROM malls WHERE mall_id = $1`, [mallId]),
    one<{ unverified: number }>(
      `SELECT count(*)::int AS unverified FROM responses WHERE mall_id = $1 AND created_at >= $2 AND verified = FALSE`,
      [mallId, since.toISOString()]
    ),
  ]);
  const orders = await countOrders(mallId, kstDate(since), kstDate(new Date()));
  const s = summarize(rows, days);
  const top = s.channels[0];
  const maxShare = top?.share || 1;
  const maxDaily = Math.max(1, ...s.daily.map((d) => d.count));
  const rate = orders && orders > 0 ? Math.min(1, s.total / orders) : null;
  const scriptInstalled = !!mall?.script_no;

  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <span className="logo"><span className="logo-mark" aria-hidden>길</span>{BRAND.name}</span>
          <span className="mall">{mallId}</span>
          <span className={`pill ${plan.paused ? "warn" : "ok"}`}>{plan.label}</span>
          {plan.monthLimit !== null && (
            <span className="pill">이번 달 {plan.monthCount}/{plan.monthLimit}건</span>
          )}
          <a className="btn ghost sm" href="/api/export">CSV 내보내기</a>
        </div>
      </header>

      <main className="page">
        {searchParams.installed && (
          <p className="notice ok">설치가 끝났습니다. 이제 주문 완료 화면에서 고객에게 설문이 보입니다.</p>
        )}
        {searchParams.billing === "paid" && <p className="notice ok">결제가 확인되어 Pro로 바뀌었습니다.</p>}
        {searchParams.billing === "pending" && (
          <p className="notice">결제 확인을 기다리고 있습니다. 결제를 마치셨다면 잠시 후 이 화면을 새로고침해 주세요.</p>
        )}
        {!scriptInstalled && (
          <div className="notice warn row">
            <span>주문 완료 화면에 설문 스크립트가 설치되지 않았습니다.</span>
            <ReinstallButton />
          </div>
        )}
        {plan.paused && (
          <div className="notice warn row">
            <span>이번 달 무료 응답 {plan.monthLimit}건을 모두 받아 설문을 잠시 멈췄습니다. 다음 달 1일에 다시 시작되며, Pro는 제한이 없습니다.</span>
            {plan.billing === "cafe24" && <UpgradeButton price={env.proPriceKrw} />}
          </div>
        )}

        <div className="page-head">
          <h1>유입경로 리포트</h1>
          <nav className="range" aria-label="기간">
            {RANGES.map((d) => (
              <a key={d} href={`/dashboard?days=${d}`} aria-current={d === days ? "page" : undefined}>최근 {d}일</a>
            ))}
          </nav>
        </div>

        <section className="kpis" aria-label="요약">
          <div className="kpi top">
            <div className="kpi-label">1위 유입경로</div>
            <div className="kpi-value">{top ? top.label : "-"}</div>
            <div className="kpi-sub">{top ? `응답의 ${pct(top.share)}` : "응답이 쌓이면 표시됩니다"}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">응답 수</div>
            <div className="kpi-value">{s.total.toLocaleString("ko-KR")}건</div>
            <div className="kpi-sub">최근 {days}일</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">응답률</div>
            <div className="kpi-value">{rate === null ? "-" : pct(rate)}</div>
            <div className="kpi-sub">{orders === null ? "주문 수를 불러오지 못했습니다" : `같은 기간 주문 ${orders.toLocaleString("ko-KR")}건 기준`}</div>
          </div>
          <div className="kpi">
            <div className="kpi-label">응답 고객 결제금액</div>
            <div className="kpi-value">{won(s.revenue)}</div>
            <div className="kpi-sub">
              {verifiedRow?.unverified ? `주문 미확인 ${verifiedRow.unverified}건 포함` : "카페24 주문으로 확인한 금액"}
            </div>
          </div>
        </section>

        <div className="grid2">
          <section className="card" aria-labelledby="ch">
            <div className="card-head">
              <h2 id="ch">채널별 유입</h2>
              <p className="muted">고객이 직접 답한 경로 기준</p>
            </div>
            {s.total === 0 ? (
              <div className="empty">
                <strong>아직 응답이 없습니다</strong>
                고객이 주문을 마치면 이곳에 채널별 응답과 매출이 쌓입니다.
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr><th>유입경로</th><th>비중</th><th className="n">응답</th><th className="n">매출</th><th className="n">객단가</th></tr>
                  </thead>
                  <tbody>
                    {s.channels.map((c, i) => (
                      <tr key={c.label} className={i === 0 ? "first" : undefined}>
                        <td className="chan">{c.label}</td>
                        <td style={{ width: "34%" }}>
                          <div className="row" style={{ flexWrap: "nowrap" }}>
                            <div className="bar" style={{ flex: 1 }}><i style={{ width: `${(c.share / maxShare) * 100}%` }} /></div>
                            <span className="num muted">{pct(c.share)}</span>
                          </div>
                        </td>
                        <td className="n">{c.count.toLocaleString("ko-KR")}</td>
                        <td className="n">{won(c.revenue)}</td>
                        <td className="n">{c.avgOrder === null ? "-" : won(c.avgOrder)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card" aria-labelledby="tr">
            <div className="card-head">
              <h2 id="tr">일별 응답</h2>
              <p className="muted">하루 최대 {maxDaily}건</p>
            </div>
            <div className="trend" role="img" aria-label={`최근 ${days}일 일별 응답 수`}>
              {s.daily.map((d) => (
                <span key={d.date} className={d.count ? undefined : "zero"} style={{ height: `${Math.max(4, (d.count / maxDaily) * 100)}%` }} title={`${d.date} · ${d.count}건`} />
              ))}
            </div>
            <div className="trend-axis"><span>{s.daily[0]?.date.slice(5)}</span><span>{s.daily[s.daily.length - 1]?.date.slice(5)}</span></div>
            <h2 style={{ marginTop: 8 }}>&lsquo;기타&rsquo; 직접 입력</h2>
            {s.otherTexts.length === 0 ? (
              <p className="muted">아직 없습니다. 자주 나오는 답은 보기로 추가해 보세요.</p>
            ) : (
              <ul className="others">
                {s.otherTexts.map((o) => (
                  <li key={o.text}><span>{o.text}</span><span className="num muted">{o.count}건</span></li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <SurveyEditor initial={survey} />

        <section className="card">
          <div className="card-head">
            <h2>설치 상태</h2>
            <span className={`pill ${scriptInstalled ? "ok" : "warn"}`}>{scriptInstalled ? "주문 완료 화면에 설치됨" : "설치 필요"}</span>
          </div>
          <p className="muted">
            쇼핑몰 디자인을 바꾼 뒤 설문이 보이지 않으면 아래 버튼으로 다시 설치하세요. 앱을 삭제하면 설문도 함께 사라집니다.
          </p>
          <div className="row"><ReinstallButton /></div>
        </section>

        <p className="foot">{BRAND.name} · 주문번호와 선택한 답만 저장하며 고객 개인정보는 받지 않습니다.</p>
      </main>
    </>
  );
}
