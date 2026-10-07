import type { ReportChart, ReportPresentation } from "@/lib/report-presentation";
import styles from "./report-brief.module.css";

function FinancialChart({ chart, print }: { chart: ReportChart; print: boolean }) {
  const minimum = Math.min(0, ...chart.points.map(point => point.value));
  const maximum = Math.max(0, ...chart.points.map(point => point.value));
  const span = maximum - minimum || 1;
  const position = (value: number) => 175 + ((value - minimum) / span) * 425;
  const zero = position(0), height = chart.points.length * 38 + 30;
  return <figure className={styles.figure}>
    <figcaption><strong>{chart.title}</strong><span>단위: {chart.unit}</span></figcaption>
    <svg role="img" aria-label={`${chart.title}. 아래 표에서 기간, 값과 출처를 확인할 수 있습니다.`}
      viewBox={`0 0 700 ${height}`} className={styles.chart}>
      <title>{`${chart.title} (${chart.unit})`}</title>
      <line x1={zero} x2={zero} y1={8} y2={height - 18} stroke="#94a3b8" />
      {chart.points.map((point, index) => {
        const x = position(point.value), y = index * 38 + 10;
        return <g key={`${point.period}-${point.scenario}`}>
          <text x={0} y={y + 18} fill="#334155" fontSize={14}>{point.label}</text>
          <rect x={Math.min(zero, x)} y={y} width={Math.abs(x - zero)} height={26}
            fill={point.scenario === "FORECAST" ? "#eff6ff" : "#2563eb"} stroke="#2563eb"
            strokeDasharray={point.scenario === "FORECAST" ? "4 3" : undefined} />
          <text x={620} y={y + 18} fill="#0f172a" fontSize={14}>
            {point.value.toLocaleString("ko-KR", { maximumFractionDigits: 20 })}
          </text>
        </g>;
      })}
    </svg>
    <p className={styles.note}>실적: 채운 막대 · 전망: 점선 막대. 업로드 자료 기재 수치이며 독립 검증을 뜻하지 않습니다.</p>
    <details open={print || undefined} className={styles.sources}>
      <summary>값과 출처 확인</summary>
      <div className={styles.tableScroll}><table><thead><tr><th>기간</th><th>값 ({chart.unit})</th><th>구분</th><th>출처</th></tr></thead>
        <tbody>{chart.points.map(point => <tr key={`${point.period}-${point.scenario}`}>
          <td>{point.period}</td><td>{point.value.toLocaleString("ko-KR", { maximumFractionDigits: 20 })}</td>
          <td>{point.scenario === "ACTUAL" ? "실적" : "전망"}</td><td>{point.source}</td>
        </tr>)}</tbody></table></div>
    </details>
  </figure>;
}

/** The same server-built presentation is used by reader, PDF and file exports. */
export function ReportBrief({ presentation: p, print = false }: { presentation: ReportPresentation; print?: boolean }) {
  return <section className={styles.brief} aria-label="한눈에 보는 투자 요약">
    <div className={styles.heading}><h2>{p.companyName} 투자 요약</h2><span>{p.recommendation}</span></div>
    <p className={styles.thesis}>{p.thesis}</p>
    <p className={styles.note}>자동 검토 요약 · 심사역의 확정 의견이나 투자 승인이 아닙니다.</p>
    {!p.ready && <p className={styles.warning}>확정할 판단 요약을 준비 중입니다. 아래 자료와 상세 근거를 먼저 검토해주세요.</p>}
    {p.totals.contradictions > 0 && <p className={styles.warning}>
      수치 상충 {p.totals.contradictions}건이 있습니다. 서로 다른 값을 먼저 대조해주세요.
    </p>}
    <dl className={styles.terms}>{p.terms.map(item => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl>
    <div className={styles.arguments}>
      <section><h3>투자 근거 <span>{p.totals.reasons}건</span></h3>
        {p.reasons.length ? <ol>{p.reasons.map(item => <li key={item.title}><strong>{item.title}</strong>
          <p>{item.detail}</p><small>{item.source}</small></li>)}</ol> : <p className={styles.note}>투자 근거를 준비 중입니다.</p>}
      </section>
      <section><h3>반대 근거 <span>{p.totals.risks}건</span></h3>
        {p.risks.length ? <ol>{p.risks.map(item => <li key={item.title}><strong>{item.title}</strong><p>{item.detail}</p></li>)}</ol>
          : <p className={styles.note}>표시할 반대 근거가 없습니다. 위험이 없다는 뜻은 아닙니다.</p>}
      </section>
      <section><h3>결정 전에 확인 <span>{p.totals.blockers}건</span></h3>
        {p.blockers.length ? <ol>{p.blockers.map(item => <li key={item.title}><strong>{item.title}</strong><p>{item.evidence}</p></li>)}</ol>
          : <p className={styles.note}>미확인 사항 목록을 검토해주세요.</p>}
      </section>
    </div>
    <p className={styles.note}>각 구획은 주요 3건입니다. 전체 쟁점은 아래 판단 근거에 보존합니다. 출처 존재와 사실 검증은 다릅니다.</p>
    <div className={styles.visuals}><h3>핵심 수치</h3>
      {p.charts.length ? p.charts.map(chart => <FinancialChart key={chart.id} chart={chart} print={print} />)
        : <p className={styles.note}>같은 지표의 기간·단위·출처와 실적/전망 구분이 확인된 수치가 부족해 추이 차트를 만들지 않았습니다.</p>}
    </div>
  </section>;
}
