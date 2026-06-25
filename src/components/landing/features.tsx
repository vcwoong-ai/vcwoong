const FEATURES = [
  {
    emoji: "🧬",
    title: "섹터별 전문가 6명",
    desc: "BIO/IT/AI/제조/콘텐츠/핀테크 각 섹터 전문 AI가 심층 분석합니다. Dr. Cell은 파이프라인 NPV·FDA 벤치마크를 자동 계산합니다.",
  },
  {
    emoji: "📄",
    title: "양식 1:1 재현",
    desc: "우리 회사 PPTX·Word 양식을 업로드하면 디자인 그대로 보고서를 생성합니다. 다시 타이핑하지 마세요.",
  },
  {
    emoji: "🔄",
    title: "풀사이클 자동화",
    desc: "딜소싱 → 초기심사 → 후속관리 → LP 리포팅까지 전 주기를 커버합니다.",
  },
  {
    emoji: "⚡",
    title: "5분 완성",
    desc: "IR 자료 업로드 후 평균 5분 이내에 완성된 심사보고서를 받아보세요.",
  },
  {
    emoji: "🔒",
    title: "보안 최우선",
    desc: "모든 데이터는 암호화 저장됩니다. 타 VC와 데이터가 절대 공유되지 않습니다.",
  },
  {
    emoji: "🇰🇷",
    title: "한국 VC 특화",
    desc: "KISVALUE, TS2000 등 국내 데이터베이스 연동. 한국 VC 심사 관행을 학습했습니다.",
  },
];

export function Features() {
  return (
    <section className="py-20 px-4 bg-white">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
          왜 DealSync인가요?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="p-6 rounded-xl border border-gray-100 hover:shadow-md transition-shadow">
              <span className="text-3xl mb-3 block">{f.emoji}</span>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
