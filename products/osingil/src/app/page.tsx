import { BRAND } from "@/lib/brand";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

const SAMPLE = [
  { label: "인스타그램", pct: 34 },
  { label: "지인 추천", pct: 27 },
  { label: "네이버 검색", pct: 18 },
  { label: "유튜브", pct: 12 },
  { label: "기타", pct: 9 },
];

export default function Landing() {
  const price = env.proPriceKrw.toLocaleString("ko-KR");
  const free = env.freeMonthlyResponses.toLocaleString("ko-KR");
  const beta = env.billingMode === "off";
  return (
    <>
      <div className="l-wrap">
        <nav className="l-nav" aria-label="주 메뉴">
          <span className="logo"><span className="logo-mark" aria-hidden>길</span>{BRAND.name}</span>
          <a className="btn ghost sm" href={env.appStoreUrl}>카페24 앱스토어</a>
        </nav>
        <header className="l-hero">
          <div>
            <div className="l-eyebrow">카페24 쇼핑몰 전용 · 구매 후 설문</div>
            <h1>광고비 어디에 쓸지,<br /><em>산 사람</em>에게 물어보세요.</h1>
            <p className="l-lede">
              주문 완료 화면에서 &ldquo;어디서 알고 오셨나요?&rdquo; 한 문항만 묻습니다. 광고 관리자 숫자에 잡히지 않는
              지인 추천, 인스타 앱 안 브라우저, 유튜브 시청 후 검색까지 채널별 실제 매출로 모아 보여드립니다.
            </p>
            <div className="l-cta">
              <a className="btn" href={env.appStoreUrl}>무료로 설치하기</a>
              <a className="btn ghost" href="#how">어떻게 동작하나요</a>
              <span className="l-small">설치 1분, 코드 수정 없음. 주문번호로 실제 결제금액을 확인해 집계합니다.</span>
            </div>
          </div>
          <figure className="l-shot" aria-label="예시 대시보드">
            <h3>예시 · 최근 30일 유입경로 (구매 고객 응답 기준)</h3>
            <div className="tbl-wrap">
              <table>
                <tbody>
                  {SAMPLE.map((s, i) => (
                    <tr key={s.label} className={i === 0 ? "first" : undefined}>
                      <td className="chan">{s.label}</td>
                      <td style={{ width: "55%" }}><div className="bar"><i style={{ width: `${s.pct / 0.34}%` }} /></div></td>
                      <td className="n">{s.pct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="l-gap">
              <div><span>광고 관리자가 잡은 &lsquo;지인 추천&rsquo;</span><strong>0%</strong></div>
              <div className="hi"><span>고객이 직접 답한 &lsquo;지인 추천&rsquo;</span><strong>27%</strong></div>
            </div>
          </figure>
        </header>
      </div>

      <section className="l-band" id="how">
        <div className="l-wrap">
          <h2>설치하면 바로 이렇게 동작합니다</h2>
          <ol className="l-steps">
            <li><b>앱 설치</b><p>카페24 앱스토어에서 설치하고 권한에 동의하면 주문 완료 화면에 설문이 자동으로 붙습니다.</p></li>
            <li><b>고객 응답</b><p>결제를 마친 고객에게 한 문항만 보여줍니다. 탭 한 번이면 끝나서 응답률이 높습니다.</p></li>
            <li><b>채널별 매출 확인</b><p>주문번호로 실제 결제금액을 확인해 채널별 응답 비중, 매출, 객단가를 보여드립니다.</p></li>
          </ol>
        </div>
      </section>

      <section className="l-band alt">
        <div className="l-wrap">
          <h2>왜 광고 관리자 숫자와 다를까요</h2>
          <p className="intro">픽셀과 UTM은 클릭을 따라가지만, 사람은 클릭하지 않고도 브랜드를 알게 됩니다. 구매 후 설문은 그 빈칸을 고객의 말로 채웁니다.</p>
          <div className="l-why">
            <div><b>지인 추천·입소문</b><p>링크 없이 이름만 듣고 검색해 들어온 고객은 &lsquo;네이버 검색&rsquo;이나 &lsquo;직접 방문&rsquo;으로 잡힙니다.</p></div>
            <div><b>인스타·유튜브 콘텐츠</b><p>영상을 보고 며칠 뒤 검색해 사면 광고 성과로 잡히지 않습니다. 고객은 기억합니다.</p></div>
            <div><b>앱 안 브라우저·iOS 추적 제한</b><p>추적이 끊겨도 설문 응답은 남습니다.</p></div>
            <div><b>채널별 객단가</b><p>어떤 채널 고객이 더 많이 사는지 결제금액 기준으로 비교합니다.</p></div>
          </div>
        </div>
      </section>

      <section className="l-band">
        <div className="l-wrap">
          <h2>요금</h2>
          {beta && <p className="intro">지금은 베타 기간이라 모든 기능을 무료·무제한으로 쓸 수 있습니다.</p>}
          <div className="l-price">
            <div className="l-plan">
              <b>무료</b>
              <div className="amt">0원</div>
              <ul><li>월 응답 {free}건까지</li><li>채널별 응답·매출 대시보드</li><li>CSV 내보내기</li></ul>
            </div>
            <div className="l-plan main">
              <b>Pro</b>
              <div className="amt">{price}원<small>/월</small></div>
              <ul><li>응답 수 무제한</li><li>무료 플랜의 모든 기능</li><li>카페24 앱스토어 결제</li></ul>
            </div>
          </div>
        </div>
      </section>

      <section className="l-band alt">
        <div className="l-wrap">
          <h2>자주 묻는 질문</h2>
          <div className="l-faq">
            <details><summary>고객 개인정보를 수집하나요?</summary><p>아니요. 주문번호와 선택한 답만 저장합니다. 이름·연락처·주소는 받지 않습니다.</p></details>
            <details><summary>쇼핑몰 디자인을 고쳐야 하나요?</summary><p>아니요. 카페24 스크립트 설치 기능으로 주문 완료 화면에만 자동으로 붙고, 앱을 삭제하면 함께 사라집니다.</p></details>
            <details><summary>질문과 보기를 바꿀 수 있나요?</summary><p>네. 대시보드에서 질문, 보기(최대 12개), &lsquo;기타 직접 입력&rsquo; 허용 여부, 보기 순서 섞기를 바꿀 수 있습니다.</p></details>
            <details><summary>고객이 귀찮아하지 않을까요?</summary><p>결제가 끝난 뒤 한 번만, 탭 한 번으로 끝나는 문항만 보여줍니다. 닫으면 같은 주문에서 다시 뜨지 않습니다.</p></details>
          </div>
        </div>
      </section>

      <footer className="l-wrap l-foot">
        {BRAND.name} · {BRAND.tagline}
        {env.supportEmail ? <> · 문의 {env.supportEmail}</> : null}
      </footer>
    </>
  );
}
