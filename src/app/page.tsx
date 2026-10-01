import Link from "next/link";
import styles from "./landing.module.css";
import { BRAND } from "@/lib/brand";
import { PLAN_LIMITS } from "@/lib/quotas";
import { LandingAuthRedirect } from "@/components/landing-auth-redirect";
import { LandingPricing } from "@/components/landing/landing-pricing";
import { ProductPreview } from "@/components/landing/product-preview";
import { ArrowRight, Briefcase, Building2, KeyRound, Lock, ShieldCheck, Users2 } from "lucide-react";

/**
 * 랜딩 — 기능 이름을 나열하지 않고 "무엇을 연결해 주는가"를 실제 화면 구성으로 보여준다.
 *
 * 쓰지 않는 것: 고객 로고·후기·사용자 수·시간 절감률·AI 정확도·받지 않은 보안 인증.
 * 모든 문구는 현재 제품에 구현된 기능과 대조한 것이다(예: 자문사 양식 재현은 VC 트랙 기능, PE에는 미적용).
 */

const CHAIN = [
  {
    from: "주장",
    to: "근거",
    tracks: "VC",
    body: "보고서에 쓰인 수치를 업로드 자료와 대조해 문서 · 위치 · 원문 발췌와 함께 보여줍니다. 자료에 없는 값은 '근거 없음'으로 따로 모읍니다.",
  },
  {
    from: "재무 수치",
    to: "기간 · 통화 · 출처",
    tracks: "PE/M&A",
    body: "재무제표 값마다 기간과 통화, 출처(경영진 제공 · DART · 업로드 문서)를 같은 행에서 확인합니다.",
  },
  {
    from: "충돌",
    to: "상충하는 값",
    tracks: "VC · PE/M&A",
    body: "같은 지표가 출처마다 다르면 값을 나란히 보여줍니다. 시스템이 하나를 골라 계산에 쓰지 않습니다.",
  },
  {
    from: "미확인 정보",
    to: "필요한 자료",
    tracks: "VC · PE/M&A",
    body: "무엇이 비어 있는지, 판단에 얼마나 중요한지, 어떤 자료가 있으면 풀리는지를 우선순위와 함께 정리합니다.",
  },
  {
    from: "검토 완료",
    to: "검토 당시 상태 · 이력",
    tracks: "PE/M&A",
    body: "위원회 자료의 검토 서명은 당시의 자료 상태와 함께 남습니다. '검토 완료'는 투자 승인과 다릅니다.",
  },
  {
    from: "자료 변경",
    to: "재검토 필요",
    tracks: "PE/M&A",
    body: "서명 이후 자료가 바뀌면 '재검토 필요'로 표시되어, 과거 검토와 현재 데이터를 구분해서 읽을 수 있습니다.",
  },
] as const;

const VC_QUESTIONS = [
  "왜 검토할 만한 딜인가?",
  "그 판단에 어떤 근거가 있는가?",
  "무엇이 투자 논지를 깨뜨리는가?",
  "무엇을 더 확인해야 하는가?",
  "IC에서 무엇을 질문해야 하는가?",
];

const PE_QUESTIONS = [
  "어떤 재무정보를 신뢰할 수 있는가?",
  "QoE와 LBO는 어떤 입력에 근거하는가?",
  "어떤 실사 이슈가 남아 있는가?",
  "검토 당시 어떤 자료를 봤는가?",
  "자료가 바뀐 뒤 무엇을 다시 검토해야 하는가?",
];

const AGENTS = [
  ["Dr. Cell", "BIO/헬스케어"],
  ["Code", "IT/SaaS"],
  ["Neuron", "AI/딥테크"],
  ["Maker", "제조/하드웨어"],
  ["Story", "콘텐츠/엔터"],
  ["Vault", "핀테크/금융"],
] as const;

const SECURITY = [
  {
    icon: Lock,
    title: "전 구간 HTTPS + 저장 데이터 암호화",
    desc: "업로드 문서·보고서는 전송 구간 TLS로 보호되고, 저장소(Neon/Vercel)에서 저장 시 암호화됩니다.",
  },
  {
    icon: KeyRound,
    title: "비밀번호 해시 저장",
    desc: "비밀번호는 bcrypt로 해시해 저장하며 평문으로 보관하지 않습니다.",
  },
  {
    icon: Users2,
    title: "팀 단위 권한 분리",
    desc: "관리자·파트너·심사역 역할별로 조회·편집 권한이 나뉘고, 팀 밖으로 딜 데이터가 노출되지 않습니다.",
  },
  {
    icon: ShieldCheck,
    title: "결제 웹훅 서명 검증 + 요청 제한",
    desc: "결제 이벤트는 서명을 검증한 요청만 처리하고, 가입·로그인·생성 요청은 비정상 폭주를 막는 속도 제한이 걸려 있습니다.",
  },
];

const FAQ = [
  {
    q: "AI가 지어낸 숫자인지 어떻게 아나요?",
    a: "보고서의 모든 수치를 업로드한 자료와 대조해 '문서 확인 / 딜 입력 / 근거 없음'으로 표시합니다. 문서에서 나온 값은 어느 파일 어느 문장인지 원문 발췌까지 보여주고, 자료 어디에도 없는 값은 따로 모아 둡니다. 같은 지표가 자료마다 다르면 값을 골라주지 않고 나란히 보여줍니다.",
  },
  {
    q: "AI가 생성한 보고서를 그대로 투자심의위원회에 제출할 수 있나요?",
    a: `아니요, 초안으로 활용하세요. ${BRAND.name}는 심사역이 확인해야 할 근거·상충·미확인 정보를 먼저 보여주는 도구이며, 투자 판단과 최종 제출은 심사역의 몫입니다.`,
  },
  {
    q: "기존에 쓰던 위원회 보고서 양식을 그대로 쓸 수 있나요?",
    a: "VC 트랙에서 Sector Pro 이상 플랜은 업로드한 DOCX·PPTX 양식의 섹션 구조에 맞춰 보고서를 생성합니다. PE/M&A 위원회 자료에는 아직 적용되지 않습니다.",
  },
  {
    q: "PE · M&A 트랙은 무엇을 할 수 있나요?",
    a: "무료 가입 후 PE/M&A 워크스페이스에서 딜을 만들면 재무제표 입력과 출처별 충돌 확인, QoE 조정 검토, LBO 시뮬레이션, DART 공시 연동, 데이터룸 근거 추적, 위원회 자료(인쇄·DOCX·PPTX)와 검토 이력을 사용할 수 있습니다. 현재 별도의 플랜 제한 없이 열려 있으며, 월 보고서 한도는 VC 보고서 생성에 적용됩니다.",
  },
  {
    q: "BIO 섹터 보고서는 어떻게 다른가요?",
    a: "Dr. Cell 에이전트는 BIO 딜에서 PubMed 논문, ClinicalTrials.gov 임상 현황, OpenFDA 허가 데이터를 조회해 인용하고 rNPV 계산기를 제공합니다. 외부 데이터 연동은 Full-Stack 이상 플랜에 포함됩니다.",
  },
  {
    q: "데이터는 안전하게 보관되나요?",
    a: "업로드된 문서와 보고서는 저장 시 암호화되고 팀 밖으로 공유되지 않습니다. 다만 AI 분석·생성 시 문서 내용이 외부 AI 모델 제공자(OpenRouter 경유)로 전송되며, 제공자별 데이터 보존·학습 정책은 각 제공자의 약관을 따릅니다.",
  },
  {
    q: "팀으로 쓸 수 있나요?",
    a: "팀 협업(딜·양식 공유)은 Multi-Sector 플랜부터 제공됩니다. 조직 규모가 크거나 별도 계약이 필요하면 문의해 주세요.",
  },
];

export default function LandingPage() {
  return (
    <div className={`${styles.landing} min-h-screen selection:bg-primary selection:text-primary-foreground`}>
      <LandingAuthRedirect />

      {/* Navigation */}
      <nav className={`${styles.nav} fixed inset-x-0 top-0 z-50`} aria-label="주 메뉴">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className={styles.brandMark}>
              {BRAND.name.slice(0, 1)}
            </span>
            <span className="text-base font-semibold tracking-tight text-white">{BRAND.name}</span>
          </Link>
          <div className={styles.navLinks}>
            <a href="#evidence" className="transition-colors hover:text-foreground">근거 연결</a>
            <a href="#tracks" className="transition-colors hover:text-foreground">VC · PE/M&A</a>
            <a href="#pricing" className="transition-colors hover:text-foreground">가격</a>
            <Link href="/irr-calculator" className="transition-colors hover:text-foreground">IRR 계산기</Link>
            <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className={styles.loginLink}>
              로그인
            </Link>
            <Link
              href="/register"
              className={styles.navCta}
            >
              무료 시작
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className={styles.hero} aria-labelledby="hero-title">
        <div className={styles.heroGrid}>
          <div>
            <p className={styles.label}>INVESTMENT INTELLIGENCE / VC · PE</p>
            <h1
              id="hero-title"
              className="mt-4 text-4xl font-semibold leading-[1.15] tracking-tight md:text-5xl"
            >
              투자의 논지부터,<br /><span>판단의 근거까지.</span>
            </h1>
            <p className={styles.heroCopy}>
              VC의 투자 논지부터 PE/M&A의 실사·재무·검토 이력까지, 근거와 미확인 사항을 하나의 업무 흐름으로 연결합니다.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/register"
                className={styles.primaryCta}
              >
                무료로 시작하기
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <Link
                href="/login"
                className={styles.secondaryCta}
              >
                데모 계정으로 체험
              </Link>
            </div>
            <p className={styles.heroNote}>
              신용카드 없이 가입 · Free 플랜은 월 {PLAN_LIMITS.free.reports}건 VC 보고서 · PE/M&A 워크스페이스 이용 가능
            </p>
          </div>
          <ProductPreview />
        </div>
        <ol className={styles.path} aria-label="투자 검토 흐름">
          <li><span>01 /</span><div><strong>근거를 연결하고</strong><small>보고서의 숫자에서 출처와 원문까지</small></div></li>
          <li><span>02 /</span><div><strong>판단의 빈틈을 확인하고</strong><small>상충하는 값과 미확인 정보를 구분</small></div></li>
          <li><span>03 /</span><div><strong>다음 검토로 이어갑니다</strong><small>IC 질문, 위원회 자료와 검토 이력</small></div></li>
        </ol>
      </section>

      {/* 근거 연결 */}
      <section id="evidence" className="border-y border-border bg-card px-6 py-20" aria-labelledby="evidence-title">
        <div className="mx-auto max-w-6xl">
          <h2 id="evidence-title" className="text-2xl font-semibold tracking-tight md:text-3xl">
            결론 옆에 근거가 붙어 있습니다
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            보고서를 요약하는 데서 끝나지 않고, 각 판단이 무엇에 기대고 있는지 화면에서 바로 따라갈 수 있게 연결합니다.
          </p>
          <ul className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
            {CHAIN.map((item) => (
              <li key={item.from} className="border-t border-border pt-4">
                <p className="text-xs font-medium text-muted-foreground">{item.tracks}</p>
                <p className="mt-1 text-base font-semibold text-foreground">
                  {item.from}
                  <span className="mx-2 text-primary" aria-label="에서 이어지는">→</span>
                  {item.to}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 트랙 */}
      <section id="tracks" className="px-6 py-20" aria-labelledby="tracks-title">
        <div className="mx-auto max-w-6xl">
          <h2 id="tracks-title" className="text-2xl font-semibold tracking-tight md:text-3xl">
            어떤 검토를 하십니까
          </h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            두 트랙은 같은 근거 확인 방식을 쓰되, 판단의 기준은 각자의 업무에 맞게 분리되어 있습니다.
          </p>
          <div className="mt-10 grid gap-6 lg:grid-cols-2">
            <TrackCard
              icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
              name="VC 심사역"
              href="/register?track=vc"
              cta="VC 트랙으로 시작"
              questions={VC_QUESTIONS}
              output="투자 판단 화면(근거 · 논지 훼손 요인 · 미확인 정보 · IC 질문)과 투자심의 보고서 DOCX·PPTX"
              note={`섹터 전문 AI 6명(${AGENTS.map(([n]) => n).join(" · ")})이 섹터에 맞는 프레임워크로 초안을 씁니다. 회사 양식 재현은 Sector Pro 이상.`}
            />
            <TrackCard
              icon={<Briefcase className="h-5 w-5" aria-hidden="true" />}
              name="PE · M&A"
              href="/register?track=pe"
              cta="PE/M&A 트랙으로 시작"
              questions={PE_QUESTIONS}
              output="딜 검토 상황(차단 요인 · 다음 행동)과 위원회 자료 인쇄/PDF · DOCX · PPTX, 검토 이력"
              note="재무제표 입력, QoE 조정, LBO 시뮬레이션, DART 공시 연동, 데이터룸 근거 추적을 한 딜에서 다룹니다. 자문사 고유 양식 재현은 아직 적용되지 않습니다."
            />
          </div>
        </div>
      </section>

      {/* 가격 */}
      <LandingPricing />

      {/* 보안 */}
      <section className="border-y border-border bg-card px-6 py-20" aria-labelledby="security-title">
        <div className="mx-auto max-w-5xl">
          <h2 id="security-title" className="text-2xl font-semibold tracking-tight md:text-3xl">보안</h2>
          <p className="mt-3 text-muted-foreground">
            지금 실제로 적용돼 있는 것만 안내합니다. 받지 않은 인증은 표시하지 않습니다.
          </p>
          <ul className="mt-8 grid gap-6 sm:grid-cols-2">
            {SECURITY.map((item) => (
              <li key={item.title} className="flex gap-4">
                <item.icon className="mt-0.5 h-5 w-5 shrink-0 text-primary" strokeWidth={1.75} aria-hidden="true" />
                <div>
                  <p className="font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-xs text-muted-foreground">
            SOC 2, ISO 27001 등 제3자 보안 인증은 아직 받지 않았습니다. 필요하신 경우 별도로 문의해 주세요.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-6 py-20" aria-labelledby="faq-title">
        <div className="mx-auto max-w-3xl">
          <h2 id="faq-title" className="text-2xl font-semibold tracking-tight md:text-3xl">자주 묻는 질문</h2>
          <div className="mt-8 divide-y divide-border border-y border-border">
            {FAQ.map((faq) => (
              <details key={faq.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <span aria-hidden="true" className="mt-0.5 text-muted-foreground transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-border bg-card px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">첫 딜부터 근거를 확인하세요</h2>
          <p className="mt-3 text-muted-foreground">신용카드 없이 가입하고, VC 또는 PE/M&A 딜을 바로 만들어 볼 수 있습니다.</p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link
              href="/register?track=vc"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              VC 트랙으로 시작 <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
            <Link
              href="/register?track=pe"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-input bg-card px-6 py-3 text-sm font-medium text-foreground hover:bg-muted"
            >
              PE/M&A 트랙으로 시작
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-background px-6 py-12 text-sm text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-8 md:flex-row">
          <div>
            <p className="flex items-center gap-2 font-semibold text-foreground">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
                {BRAND.name.slice(0, 1)}
              </span>
              {BRAND.name}
            </p>
            <p className="mt-3 max-w-sm">
              {BRAND.name}({BRAND.nameKr}) — 딜을 요약하는 게 아니라 판단의 근거를 남깁니다.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            <div>
              <p className="mb-3 font-medium text-foreground">제품</p>
              <ul className="space-y-2">
                <li><a href="#evidence" className="hover:text-foreground">근거 연결</a></li>
                <li><a href="#tracks" className="hover:text-foreground">VC · PE/M&A</a></li>
                <li><Link href="/pricing" className="hover:text-foreground">가격</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-3 font-medium text-foreground">계정</p>
              <ul className="space-y-2">
                <li><Link href="/login" className="hover:text-foreground">로그인</Link></li>
                <li><Link href="/register" className="hover:text-foreground">회원가입</Link></li>
              </ul>
            </div>
            <div>
              <p className="mb-3 font-medium text-foreground">문의</p>
              <ul className="space-y-2">
                <li>
                  <a href={`mailto:${BRAND.supportEmail}`} className="hover:text-foreground">
                    {BRAND.supportEmail}
                  </a>
                </li>
                <li><a href="#faq" className="hover:text-foreground">FAQ</a></li>
              </ul>
            </div>
          </div>
        </div>
        <p className="mx-auto mt-10 max-w-6xl border-t border-border pt-6 text-xs">
          © 2026 {BRAND.name}. All rights reserved.
        </p>
      </footer>
    </div>
  );
}

function TrackCard({
  icon,
  name,
  href,
  cta,
  questions,
  output,
  note,
}: {
  icon: React.ReactNode;
  name: string;
  href: string;
  cta: string;
  questions: string[];
  output: string;
  note: string;
}) {
  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-7">
      <div className="flex items-center gap-2.5 text-primary">
        {icon}
        <h3 className="text-lg font-semibold text-foreground">{name}</h3>
      </div>
      <p className="mt-5 text-xs font-medium text-muted-foreground">이런 질문에 답할 수 있게 정리합니다</p>
      <ul className="mt-2 space-y-1.5">
        {questions.map((q) => (
          <li key={q} className="flex gap-2 text-sm text-foreground">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-primary" aria-hidden="true" />
            {q}
          </li>
        ))}
      </ul>
      <p className="mt-5 text-xs font-medium text-muted-foreground">결과물</p>
      <p className="mt-1 text-sm text-foreground">{output}</p>
      <p className="mt-4 flex-1 text-sm leading-relaxed text-muted-foreground">{note}</p>
      <Link
        href={href}
        className="mt-6 inline-flex w-fit items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        {cta} <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </article>
  );
}
