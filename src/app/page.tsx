import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { LandingAuthRedirect } from "@/components/landing-auth-redirect";
import { LandingPricing } from "@/components/landing/landing-pricing";
import {
  ArrowRight,
  ArrowUpRight,
  Database,
  Brain,
  LayoutTemplate,
  FlaskConical,
  FileSearch,
  ShieldCheck,
  Lock,
  KeyRound,
  Users2,
  FileText,
  BarChart3,
  Building2,
  Briefcase,
  Check,
  Minus,
} from "lucide-react";

const TRACKS = [
  {
    key: "vc",
    icon: Building2,
    eyebrow: "TRACK 01",
    name: "Venture Capital",
    nameKr: "VC 심사역",
    desc: "섹터 전문 AI 6명이 투자심의보고서 초안을 씁니다. 모든 수치는 업로드 자료 원문까지 되짚을 수 있습니다.",
    points: ["BIO·IT·AI·제조·콘텐츠·핀테크 6개 섹터", "투자심의위원회 10섹션 보고서", "딜소싱 → 사후관리 → LP 리포팅"],
    soon: false,
  },
  {
    key: "pe",
    icon: Briefcase,
    eyebrow: "TRACK 02",
    name: "PE · M&A",
    nameKr: "인수·실사 자문사",
    desc: "같은 근거추적·양식재현 엔진을 인수 실사(Due Diligence) 보고서에 적용합니다.",
    points: ["재무·법무·영업·시너지 등 실사 프레임워크", "타겟기업 DART 공시 자동 연동", "자문사 고유 실사보고서 양식 그대로 재현"],
    soon: true,
  },
] as const;

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black">
      <LandingAuthRedirect />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-black/90 backdrop-blur border-b border-white/10">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-white rounded-sm flex items-center justify-center">
              <span className="text-black text-xs font-bold tracking-tight">
                {BRAND.name.slice(0, 1)}
              </span>
            </div>
            <span className="text-base font-semibold tracking-tight">{BRAND.name}</span>
          </div>
          <div className="hidden md:flex items-center gap-8 text-sm text-white/60">
            <a href="#tracks" className="hover:text-white transition-colors">트랙</a>
            <a href="#features" className="hover:text-white transition-colors">기능</a>
            <a href="#agents" className="hover:text-white transition-colors">AI 에이전트</a>
            <Link href="/pricing" className="hover:text-white transition-colors">가격</Link>
            <Link href="/irr-calculator" className="hover:text-white transition-colors">IRR 계산기</Link>
            <a href="#faq" className="hover:text-white transition-colors">FAQ</a>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-white/60 hover:text-white transition-colors">
              로그인
            </Link>
            <Link
              href="/register"
              className="bg-white text-black text-sm font-medium px-4 py-2 rounded-sm hover:bg-white/90 transition-colors"
            >
              무료 시작
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-40 pb-16 px-6 border-b border-white/10">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-mono tracking-[0.2em] text-white/40 mb-6 uppercase">
            Institutional-grade diligence, written by AI
          </p>
          <h1 className="text-5xl md:text-7xl font-semibold leading-[1.05] tracking-tight max-w-4xl">
            딜을 요약하지 않습니다.
            <br />
            <span className="text-white/50">판단의 근거를 남깁니다.</span>
          </h1>
          <p className="text-lg text-white/60 mt-8 max-w-2xl leading-relaxed">
            섹터 전문 AI가 10섹션 투자심의보고서를 자동 작성합니다. 쓰인 모든 숫자는 업로드
            자료의 원문까지 되짚을 수 있고, 근거가 없는 값은 따로 표시해 심의 전에 확인할
            것만 남깁니다.
          </p>

          {/* Stats — 숫자를 monospace로, 증권/터미널 화면 느낌 */}
          <div className="mt-12 grid grid-cols-3 max-w-xl border-y border-white/10 divide-x divide-white/10">
            {[
              { value: "10분", label: "보고서 1건 생성" },
              { value: "6", label: "섹터 전문 에이전트" },
              { value: "6", label: "연동 외부 DB" },
            ].map((stat) => (
              <div key={stat.label} className="py-5 px-4 first:pl-0">
                <div className="text-2xl font-mono font-semibold">{stat.value}</div>
                <div className="text-xs text-white/40 mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Track Selector — VC / PE·M&A */}
      <section id="tracks" className="py-20 px-6 border-b border-white/10">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between mb-10 flex-wrap gap-3">
            <div>
              <p className="text-xs font-mono tracking-[0.2em] text-white/40 mb-3 uppercase">
                Select your track
              </p>
              <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
                어떤 심사 업무를 하십니까
              </h2>
            </div>
            <p className="text-sm text-white/40 max-w-sm">
              같은 근거추적·양식재현 엔진 위에서, 트랙에 맞는 프레임워크와 용어로 보고서를
              작성합니다.
            </p>
          </div>

          <div className="grid md:grid-cols-2 border border-white/10">
            {TRACKS.map((track, i) => (
              <Link
                key={track.key}
                href={track.soon ? "#faq" : `/register?track=${track.key}`}
                className={`group relative p-8 md:p-10 ${i === 0 ? "border-b md:border-b-0 md:border-r border-white/10" : ""} hover:bg-white/[0.04] transition-colors`}
              >
                <div className="flex items-start justify-between">
                  <track.icon className="w-8 h-8 text-white/70" strokeWidth={1.5} />
                  {track.soon ? (
                    <span className="text-[10px] font-mono tracking-wider text-white/40 border border-white/15 rounded-full px-2.5 py-1 uppercase">
                      Coming soon
                    </span>
                  ) : (
                    <ArrowUpRight className="w-5 h-5 text-white/30 group-hover:text-white group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all" />
                  )}
                </div>
                <p className="text-xs font-mono tracking-[0.2em] text-white/40 mt-8 uppercase">
                  {track.eyebrow}
                </p>
                <h3 className="text-2xl font-semibold mt-2 tracking-tight">{track.name}</h3>
                <p className="text-sm text-white/50 mt-1">{track.nameKr}</p>
                <p className="text-sm text-white/60 mt-4 leading-relaxed max-w-sm">{track.desc}</p>
                <ul className="mt-6 space-y-2">
                  {track.points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-xs text-white/50">
                      <span className="w-1 h-1 rounded-full bg-white/40 mt-1.5 shrink-0" />
                      {p}
                    </li>
                  ))}
                </ul>
              </Link>
            ))}
          </div>

          <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
            <Link
              href="/register"
              className="inline-flex items-center gap-2 bg-white text-black font-medium px-6 py-3 rounded-sm hover:bg-white/90 transition-colors text-sm"
            >
              무료로 시작하기
              <ArrowRight className="w-4 h-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 border border-white/20 hover:border-white/40 text-white/70 hover:text-white font-medium px-6 py-3 rounded-sm transition-colors text-sm"
            >
              데모 계정으로 체험
            </Link>
            <p className="text-xs text-white/30">신용카드 불필요 · 5분 이내 설정 · 월 5건 무료</p>
          </div>
        </div>
      </section>

      {/* Product preview cards */}
      <section className="py-20 px-6 border-b border-white/10 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-px bg-white/10">
          <div className="bg-black p-8">
            <div className="flex items-center gap-2 mb-6">
              <FileText className="w-4 h-4 text-white/50" />
              <span className="text-xs font-mono tracking-wider text-white/40 uppercase">Report</span>
            </div>
            <div className="space-y-2.5">
              <div className="h-1.5 bg-white/15 rounded-full w-full" />
              <div className="h-1.5 bg-white/15 rounded-full w-5/6" />
              <div className="h-1.5 bg-white/15 rounded-full w-4/6" />
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-xs text-white/70 font-mono">
              <Check className="w-3.5 h-3.5" />
              근거 문서 확인 18/29
            </div>
          </div>
          <div className="bg-black p-8">
            <div className="flex items-center gap-2 mb-6">
              <BarChart3 className="w-4 h-4 text-white/50" />
              <span className="text-xs font-mono tracking-wider text-white/40 uppercase">Score</span>
            </div>
            <div className="text-4xl font-mono font-semibold">
              82<span className="text-base text-white/30">/100</span>
            </div>
            <p className="text-xs text-white/40 mt-2">투자 매력도 · 확신도 HIGH</p>
          </div>
          <div className="bg-black p-8">
            <div className="flex items-center gap-2 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
              <span className="text-xs font-mono tracking-wider text-white/40 uppercase">Agent</span>
            </div>
            <p className="text-lg font-semibold">Dr. Cell</p>
            <p className="text-xs text-white/40 mt-2 leading-relaxed">BIO 전문 AI · rNPV 계산 완료</p>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6 bg-white text-black">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-mono tracking-[0.2em] text-black/40 mb-3 uppercase">
            Why {BRAND.name}
          </p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-16">
            5가지 핵심 차별화
          </h2>

          <div className="grid md:grid-cols-2 divide-y divide-black/10 border-t border-black/10">
            {[
              {
                icon: FileSearch,
                title: "모든 숫자에 근거를 답니다",
                desc: "보고서에 쓰인 수치를 업로드 자료와 한 건씩 대조해, 어느 문서 어느 문장에서 나온 값인지 원문 발췌까지 보여줍니다. 자료에 없는 숫자는 '근거 없음'으로 따로 모아, 투자심의위원회 전에 확인할 것만 남깁니다.",
                badge: "환각 방어",
              },
              {
                icon: Brain,
                title: "섹터 전문 AI 에이전트 6명",
                desc: "범용 AI가 아닌 BIO·IT·AI/딥테크·제조·콘텐츠·핀테크 각 분야 전문 심사역 AI. Dr. Cell은 임상 성공 확률(PoS)로 rNPV를 직접 계산합니다.",
                badge: "핵심 차별화",
              },
              {
                icon: Database,
                title: "실시간 외부 데이터 자동 연동",
                desc: "PubMed 논문·ClinicalTrials.gov 임상 현황·OpenFDA 허가 데이터(BIO), KIPRIS 특허 검색(전 섹터), DART 전자공시, 뉴스·웹 교차검증(딥다이브)까지 — API 키 등록만 하면 보고서 작성 중 자동으로 조회해 반영합니다.",
                badge: "6개 외부 소스",
              },
              {
                icon: LayoutTemplate,
                title: "기존 양식 1:1 재현",
                desc: "사용 중인 투자심의위원회 보고서 DOCX를 업로드하면 AI가 섹션 구조를 분석해 동일한 순서와 제목으로 보고서를 생성합니다. 승인 없이 바로 사용 가능.",
                badge: "양식 재현 엔진",
              },
              {
                icon: FlaskConical,
                title: "딜 소싱 → 사후관리 풀사이클",
                desc: "검토부터 IR 예정, 투자심의위원회, IR 심의, 투자 완료까지 딜 파이프라인 전 단계를 하나의 플랫폼에서 관리합니다.",
                badge: "풀사이클",
              },
            ].map((feat) => (
              <div key={feat.title} className="py-10 pr-8 border-black/10 md:odd:border-r md:[&:nth-child(5)]:border-r-0">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-sm border border-black/15 flex items-center justify-center flex-shrink-0">
                    <feat.icon className="w-5 h-5" strokeWidth={1.5} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <h3 className="font-semibold text-black">{feat.title}</h3>
                      <span className="text-[10px] font-mono tracking-wider text-black/50 border border-black/15 px-1.5 py-0.5 rounded-full uppercase">
                        {feat.badge}
                      </span>
                    </div>
                    <p className="text-black/60 text-sm leading-relaxed">{feat.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Agents */}
      <section id="agents" className="py-24 px-6 border-b border-white/10">
        <div className="max-w-6xl mx-auto">
          <p className="text-xs font-mono tracking-[0.2em] text-white/40 mb-3 uppercase">The team</p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-3">전문 AI 심사역 6명</h2>
          <p className="text-white/50 mb-14">섹터별로 다른 분석 프레임워크를 사용합니다</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 border-t border-l border-white/10">
            {[
              { name: "Dr. Cell", sector: "BIO/헬스케어", desc: "rNPV · 임상 단계 · PubMed · FDA", special: "외부 DB 연동" },
              { name: "Code", sector: "IT/SaaS", desc: "ARR · NRR · LTV/CAC · Magic Number", special: "SaaS 지표" },
              { name: "Neuron", sector: "AI/딥테크", desc: "TRL · GPU 유닛이코노믹스 · 딥테크 IP", special: "TRL 분석" },
              { name: "Maker", sector: "제조/하드웨어", desc: "BOM · Capex · 공급망 · ROCE", special: "원가 구조" },
              { name: "Story", sector: "콘텐츠/엔터", desc: "IP 가치 · 팬덤 경제 · K-콘텐츠", special: "IP 밸류" },
              { name: "Vault", sector: "핀테크/금융", desc: "TPV · 신용 리스크 · NIM · 규제", special: "금융 규제" },
            ].map((agent) => (
              <div key={agent.name} className="border-b border-r border-white/10 p-6 hover:bg-white/[0.03] transition-colors">
                <div className="flex items-center gap-2 mb-3">
                  <span className="font-semibold">{agent.name}</span>
                  <span className="ml-auto text-[10px] font-mono tracking-wider text-white/40 border border-white/15 px-2 py-0.5 rounded-full uppercase">
                    {agent.special}
                  </span>
                </div>
                <p className="text-sm text-white/50 mb-2">{agent.sector}</p>
                <p className="text-xs text-white/35">{agent.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section className="py-24 px-6 bg-white text-black">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-mono tracking-[0.2em] text-black/40 mb-3 uppercase">Benchmark</p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-14">경쟁사 비교</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-t border-black/15">
              <thead>
                <tr className="border-b border-black/15">
                  <th className="text-left py-4 px-4 text-black/40 font-mono text-xs uppercase tracking-wider">기능</th>
                  <th className="py-4 px-4 text-center font-semibold">{BRAND.name}</th>
                  <th className="py-4 px-4 text-center text-black/40 font-normal">VCNote</th>
                  <th className="py-4 px-4 text-center text-black/40 font-normal">Skywork</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["수치 근거 추적 (원문 발췌)", true, false, false],
                  ["섹터 전문 AI (6개)", true, "일부", false],
                  ["기존 양식 1:1 재현", true, false, false],
                  ["PubMed/ClinicalTrials 연동", true, false, false],
                  ["rNPV 자동 계산", true, false, false],
                  ["한국 VC 보고서 특화", true, true, false],
                  ["가격 공개 (셀프서브)", true, false, false],
                  ["DOCX 내보내기", true, true, true],
                ].map(([feature, ds, vcnote, skywork], i) => (
                  <tr key={i} className="border-b border-black/10">
                    <td className="py-3.5 px-4 text-black/70">{feature as string}</td>
                    {[ds, vcnote, skywork].map((val, j) => (
                      <td key={j} className="py-3.5 px-4 text-center">
                        {val === true ? (
                          <Check className="w-4 h-4 mx-auto" strokeWidth={2} />
                        ) : val === false ? (
                          <Minus className="w-4 h-4 mx-auto text-black/20" strokeWidth={2} />
                        ) : (
                          <span className="text-[11px] font-mono text-black/50 border border-black/15 px-2 py-0.5 rounded-full">
                            {val as string}
                          </span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Security */}
      <section className="py-24 px-6 border-b border-white/10">
        <div className="max-w-4xl mx-auto">
          <p className="text-xs font-mono tracking-[0.2em] text-white/40 mb-3 uppercase">Security</p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-3">보안</h2>
          <p className="text-white/50 mb-14">
            지금 실제로 적용돼 있는 것만 안내합니다. 받지 않은 인증은 표시하지 않습니다.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-l border-white/10">
            {[
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
            ].map((item) => (
              <div key={item.title} className="border-b border-r border-white/10 p-7">
                <item.icon className="w-5 h-5 text-white/50 mb-4" strokeWidth={1.5} />
                <p className="font-semibold mb-1.5">{item.title}</p>
                <p className="text-sm text-white/50 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-white/30 mt-8">
            SOC 2, ISO 27001 등 제3자 보안 인증은 아직 받지 않았습니다. 필요하신 경우 별도로 문의해 주세요.
          </p>
        </div>
      </section>

      <div className="bg-white text-black">
        <LandingPricing />
      </div>

      {/* FAQ */}
      <section id="faq" className="py-24 px-6 border-b border-white/10">
        <div className="max-w-3xl mx-auto">
          <p className="text-xs font-mono tracking-[0.2em] text-white/40 mb-3 uppercase">FAQ</p>
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-14">자주 묻는 질문</h2>
          <div className="divide-y divide-white/10 border-t border-white/10">
            {[
              {
                q: "AI가 지어낸 숫자인지 어떻게 아나요?",
                a: "보고서의 모든 수치를 업로드한 자료와 대조해 '문서 확인 / 딜 입력 / 근거 없음'으로 표시합니다. 문서에서 나온 값은 어느 파일 어느 문장인지 원문 발췌까지 보여주고, 자료 어디에도 없는 값은 따로 모아둡니다. 확인이 필요한 숫자만 보면 되므로 전부 다시 대조할 필요가 없습니다.",
              },
              {
                q: "AI가 생성한 보고서를 그대로 투자심의위원회에 제출할 수 있나요?",
                a: `아니요, 초안으로 활용하세요. ${BRAND.name}는 심사역의 분석 시간을 80% 단축하는 도구입니다. AI가 생성한 초안을 심사역이 검토하고 편집한 후 최종 제출하는 방식을 권장합니다.`,
              },
              {
                q: "기존에 사용하던 투자심의위원회 보고서 양식을 그대로 쓸 수 있나요?",
                a: "네, 양식 재현 엔진을 통해 DOCX 또는 PPTX를 업로드하면 AI가 섹션 구조를 분석해 동일한 순서로 보고서를 생성합니다.",
              },
              {
                q: "PE · M&A 트랙은 언제 쓸 수 있나요?",
                a: "현재 준비 중입니다. VC 트랙과 같은 근거추적·양식재현 엔진을 실사(Due Diligence) 프레임워크에 맞춰 제공할 예정입니다. 관심 있으시면 무료 가입 후 문의해 주세요.",
              },
              {
                q: "BIO 섹터 보고서는 어떻게 다른가요?",
                a: "Dr. Cell 에이전트는 PubMed 논문, ClinicalTrials.gov 임상 현황, OpenFDA 승인 약물 데이터를 실시간 조회해 NCT 번호와 함께 인용합니다. rNPV 계산기도 내장되어 있습니다.",
              },
              {
                q: "데이터는 안전하게 보관되나요?",
                a: "업로드된 문서와 보고서는 암호화되어 저장되며, 귀사의 데이터로 AI 모델을 학습하지 않습니다. 팀 외부로 데이터가 공유되지 않습니다.",
              },
              {
                q: "팀 플랜은 몇 명까지 사용할 수 있나요?",
                a: "기본 팀 플랜은 10명까지 지원합니다. 대형 VC 펀드의 경우 별도 문의를 통해 맞춤 계약이 가능합니다.",
              },
            ].map((faq, i) => (
              <div key={i} className="py-6">
                <h3 className="font-semibold flex items-start gap-3">
                  <span className="text-white/30 text-sm font-mono flex-shrink-0 mt-0.5">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {faq.q}
                </h3>
                <p className="text-white/50 text-sm leading-relaxed pl-8 mt-2">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Bottom */}
      <section className="py-24 px-6 bg-white text-black">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl md:text-4xl font-semibold tracking-tight mb-4">
            지금 무료로 시작하세요
          </h2>
          <p className="text-black/50 mb-10">
            신용카드 없이 5분 안에 첫 번째 투자심의보고서를 생성할 수 있습니다.
          </p>
          <Link
            href="/register"
            className="inline-flex items-center gap-2 bg-black text-white font-medium px-8 py-4 rounded-sm hover:bg-black/85 transition-colors text-lg"
          >
            무료로 시작하기
            <ArrowRight className="w-5 h-5" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-black text-white/40 py-14 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start gap-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-6 h-6 bg-white rounded-sm flex items-center justify-center">
                  <span className="text-black text-[10px] font-bold">{BRAND.name.slice(0, 1)}</span>
                </div>
                <span className="font-semibold text-white">{BRAND.name}</span>
              </div>
              <p className="text-sm">섹터별 전문 AI 심사역을 고용하는<br />VC·PE용 투자심사보고서 자동화 SaaS</p>
              <p className="text-xs mt-3 max-w-xs">
                {BRAND.name}({BRAND.nameKr}) — 딜을 요약하는 게 아니라 판단하는 AI.
                결론과 함께 그 근거를 원문까지 되짚을 수 있게 남깁니다.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-10 text-sm">
              <div>
                <p className="text-white font-medium mb-3">제품</p>
                <div className="space-y-2">
                  <a href="#tracks" className="block hover:text-white transition-colors">트랙</a>
                  <a href="#features" className="block hover:text-white transition-colors">기능</a>
                  <a href="#agents" className="block hover:text-white transition-colors">AI 에이전트</a>
                  <Link href="/pricing" className="block hover:text-white transition-colors">가격</Link>
                </div>
              </div>
              <div>
                <p className="text-white font-medium mb-3">계정</p>
                <div className="space-y-2">
                  <Link href="/login" className="block hover:text-white transition-colors">로그인</Link>
                  <Link href="/register" className="block hover:text-white transition-colors">회원가입</Link>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 mt-10 pt-8 text-xs text-center">
            © 2026 {BRAND.name}. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
