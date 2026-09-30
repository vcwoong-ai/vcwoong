import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BRAND } from "@/lib/brand";

export const metadata = {
  title: `개인정보처리방침 | ${BRAND.name}`,
};

const SECTIONS = [
  {
    title: "1. 수집하는 개인정보 항목",
    body: [
      "회원가입 시: 이름, 이메일 주소, 비밀번호(암호화 저장)",
      "서비스 이용 과정에서: 업로드한 딜 문서(IR 덱, 재무제표 등), 생성된 보고서, 접속 로그, 서비스 이용 기록",
      "결제 시: 결제대행사(토스페이먼츠)를 통해 처리되며, 카드 정보 등 민감한 결제 정보는 당사가 직접 저장하지 않습니다.",
    ],
  },
  {
    title: "2. 개인정보의 수집 및 이용 목적",
    body: [
      "회원 식별 및 서비스 제공(투자심의보고서 생성, 딜소싱, 포트폴리오 관리 등)",
      "요금 결제 및 구독 관리",
      "서비스 개선을 위한 이용 통계 분석",
      "공지사항 전달 및 문의 응대",
    ],
  },
  {
    title: "3. 개인정보의 보유 및 이용 기간",
    body: [
      "회원 탈퇴 시 지체 없이 파기하는 것을 원칙으로 합니다.",
      "단, 관계 법령에 따라 보존이 필요한 경우 해당 법령에서 정한 기간 동안 보관합니다(예: 전자상거래법에 따른 계약·결제 기록 5년).",
    ],
  },
  {
    title: "4. 업로드 문서의 처리",
    body: [
      "회원이 업로드한 딜 관련 문서(IR 덱, 재무제표, 계약서 등)는 AI 보고서 생성 목적으로만 처리되며, 회원의 동의 없이 제3자에게 제공하지 않습니다.",
      "AI 모델 호출 시 문서 내용 일부가 외부 AI 제공사(OpenRouter 등 연동 모델 제공사)로 전송될 수 있으며, 각 제공사의 데이터 처리 정책을 따릅니다.",
    ],
  },
  {
    title: "5. 개인정보의 제3자 제공",
    body: [
      "원칙적으로 회원의 개인정보를 외부에 제공하지 않습니다.",
      "단, 결제 처리를 위해 토스페이먼츠(Toss Payments)에 결제 관련 정보가 제공되며, 법령에 근거하거나 수사기관의 적법한 요청이 있는 경우 예외로 합니다.",
    ],
  },
  {
    title: "6. 이용자의 권리",
    body: [
      "회원은 언제든지 자신의 개인정보를 조회·수정할 수 있으며, 회원탈퇴를 통해 수집 동의를 철회할 수 있습니다.",
      `개인정보 관련 문의는 ${BRAND.supportEmail} 로 연락해주시기 바랍니다.`,
    ],
  },
  {
    title: "7. 개인정보 보호책임자",
    body: [
      `${BRAND.legal.businessName} · 사업자등록번호 ${BRAND.legal.businessRegNo}`,
      `문의: ${BRAND.supportEmail}`,
    ],
  },
];

export default function PrivacyPage() {
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
        <h1 className="text-3xl font-bold text-gray-900">개인정보처리방침</h1>
        <p className="text-sm text-gray-500 mt-3">
          시행일: 2026년 9월 17일. {BRAND.name}({BRAND.nameKr})은(는) 회원의 개인정보를 소중히
          다루며, 관련 법령을 준수합니다.
        </p>

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
