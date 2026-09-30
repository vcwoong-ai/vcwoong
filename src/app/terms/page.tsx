import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BRAND } from "@/lib/brand";

export const metadata = {
  title: `이용약관 | ${BRAND.name}`,
};

const SECTIONS = [
  {
    title: "제1조 (목적)",
    body: [
      `이 약관은 ${BRAND.legal.businessName}(이하 "회사")가 제공하는 ${BRAND.name}(이하 "서비스")의 이용과 관련하여 회사와 회원 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.`,
    ],
  },
  {
    title: "제2조 (정의)",
    body: [
      '"서비스"란 회사가 제공하는 AI 기반 투자심의보고서 생성 및 딜소싱·포트폴리오 관리 플랫폼을 의미합니다.',
      '"회원"이란 이 약관에 동의하고 서비스 이용 계약을 체결한 자를 의미합니다.',
      '"딜 자료"란 회원이 서비스 이용을 위해 업로드하는 IR 덱, 재무제표, 계약서 등 문서를 의미합니다.',
    ],
  },
  {
    title: "제3조 (약관의 효력 및 변경)",
    body: [
      "이 약관은 서비스 화면에 게시하거나 기타 방법으로 회원에게 공지함으로써 효력이 발생합니다.",
      "회사는 관련 법령을 위배하지 않는 범위에서 이 약관을 변경할 수 있으며, 변경 시 적용일자 및 변경 사유를 명시하여 최소 7일 전에 공지합니다.",
    ],
  },
  {
    title: "제4조 (서비스의 제공 및 변경)",
    body: [
      "회사는 회원에게 AI 섹터 에이전트를 통한 투자심의보고서 초안 생성, 딜소싱, 양식 재현, LP 리포팅 등의 기능을 제공합니다.",
      "회사는 서비스의 내용을 변경할 수 있으며, 이 경우 변경된 서비스의 내용 및 제공일자를 명시하여 사전에 공지합니다.",
      "AI가 생성한 보고서는 참고용 초안이며, 최종 투자 판단의 책임은 회원(및 소속 조직)에게 있습니다.",
    ],
  },
  {
    title: "제5조 (서비스 이용요금 및 결제)",
    body: [
      "서비스 요금제 및 가격은 /pricing 페이지에 공개된 내용을 따릅니다.",
      "유료 구독은 토스페이먼츠를 통해 결제되며, 월간/연간 주기로 자동 갱신됩니다.",
      "회원은 설정 페이지에서 언제든지 구독을 해지할 수 있으며, 해지 시 다음 결제 주기부터 Free 플랜으로 전환됩니다.",
    ],
  },
  {
    title: "제6조 (환불 정책)",
    body: [
      "구독 결제 후 7일 이내, 서비스를 실질적으로 이용하지 않은 경우 전액 환불을 요청할 수 있습니다.",
      "그 외의 환불은 관련 법령(전자상거래법 등)이 정하는 바에 따릅니다.",
    ],
  },
  {
    title: "제7조 (회원의 의무)",
    body: [
      "회원은 업로드하는 딜 자료에 대한 적법한 권한을 보유해야 하며, 타인의 권리를 침해하는 자료를 업로드해서는 안 됩니다.",
      "회원은 서비스를 이용해 생성한 보고서를 회사가 명시한 목적(투자심의 등) 범위 내에서 사용해야 합니다.",
    ],
  },
  {
    title: "제8조 (면책조항)",
    body: [
      "회사는 AI가 생성한 보고서 내용의 정확성·완전성을 보증하지 않으며, 이를 근거로 한 투자 판단의 결과에 대해 책임을 지지 않습니다.",
      "회사는 천재지변 또는 이에 준하는 불가항력으로 인해 서비스를 제공할 수 없는 경우 책임이 면제됩니다.",
    ],
  },
  {
    title: "제9조 (분쟁 해결)",
    body: ["이 약관과 관련한 분쟁은 대한민국 법을 준거법으로 하며, 회사의 주소지 관할 법원을 관할 법원으로 합니다."],
  },
  {
    title: "부칙",
    body: ["이 약관은 2026년 9월 17일부터 적용됩니다."],
  },
];

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-6 py-4">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 w-fit"
          >
            <ArrowLeft className="w-4 h-4" />
            {BRAND.name}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold text-gray-900">이용약관</h1>
        <p className="text-sm text-gray-500 mt-3">시행일: 2026년 9월 17일</p>

        <div className="mt-10 space-y-10">
          {SECTIONS.map((section) => (
            <section key={section.title}>
              <h2 className="text-lg font-semibold text-gray-900">{section.title}</h2>
              <ul className="mt-3 space-y-2">
                {section.body.map((line) => (
                  <li key={line} className="text-sm text-gray-600 leading-relaxed">
                    {line}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="text-xs text-gray-400 mt-14 border-t pt-6">
          사업자 정보는 사업자등록 완료 후 실제 정보로 업데이트될 예정입니다. 관련 문의는{" "}
          <a href={`mailto:${BRAND.supportEmail}`} className="underline hover:text-gray-600">
            {BRAND.supportEmail}
          </a>
          로 연락해주세요.
        </p>
      </main>
    </div>
  );
}
