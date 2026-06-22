const ROWS = [
  { feature: "섹터 전문 에이전트", dealsync: "6개 (각 섹터 심층)", vcnote: "멀티에이전트", skywork: "범용 1개" },
  { feature: "양식 1:1 재현", dealsync: "✅ 픽셀 재현", vcnote: "❌", skywork: "❌" },
  { feature: "파이프라인 NPV (BIO)", dealsync: "✅ FDA/PubMed 연동", vcnote: "제한적", skywork: "❌" },
  { feature: "한국 규제 데이터", dealsync: "✅ MFDS, KISVALUE", vcnote: "✅", skywork: "❌" },
  { feature: "풀사이클", dealsync: "✅ 소싱→LP리포팅", vcnote: "심사 위주", skywork: "❌" },
  { feature: "가격 공개", dealsync: "✅ 셀프서브", vcnote: "견적제", skywork: "견적제" },
];

export function ComparisonTable() {
  return (
    <section className="py-20 px-4 bg-white">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
          경쟁사 비교
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b-2 border-gray-200">
                <th className="py-3 px-4 text-left text-gray-600 font-medium">기능</th>
                <th className="py-3 px-4 text-center text-blue-600 font-bold">DealSync</th>
                <th className="py-3 px-4 text-center text-gray-500 font-medium">VCNote</th>
                <th className="py-3 px-4 text-center text-gray-500 font-medium">Skywork</th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row) => (
                <tr key={row.feature} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 text-sm text-gray-700">{row.feature}</td>
                  <td className="py-3 px-4 text-sm text-center font-medium text-blue-700 bg-blue-50">
                    {row.dealsync}
                  </td>
                  <td className="py-3 px-4 text-sm text-center text-gray-600">{row.vcnote}</td>
                  <td className="py-3 px-4 text-sm text-center text-gray-600">{row.skywork}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
