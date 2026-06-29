const FEATURES = [
  {
    icon: "🧬",
    title: "섹터별 전문가 6명",
    desc: "BIO/IT/AI/제조/콘텐츠/핀테크 각 분야 박사급 전문 지식을 가진 AI 에이전트가 각 섹터의 핵심 기준으로 심사합니다.",
  },
  {
    icon: "📄",
    title: "회사별 양식 1:1 재현",
    desc: "우리 회사 보고서 양식을 등록하면 AI가 디자인·레이아웃 그대로 완성된 PPTX/Word 파일로 출력합니다.",
  },
  {
    icon: "🔄",
    title: "풀사이클 자동화",
    desc: "딜소싱부터 심사, 사후관리, LP 리포팅까지 투자 프로세스 전체를 AI가 지원합니다.",
  },
];

export function Features() {
  return (
    <section className="py-20 px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-3xl font-bold text-center mb-12">왜 DealSync인가</h2>
        <div className="grid md:grid-cols-3 gap-8">
          {FEATURES.map((f) => (
            <div key={f.title} className="text-center space-y-3">
              <div className="text-5xl">{f.icon}</div>
              <h3 className="text-xl font-semibold">{f.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
