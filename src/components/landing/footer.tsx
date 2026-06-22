export function Footer() {
  return (
    <footer className="bg-slate-900 text-slate-400 py-12 px-4">
      <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-8">
        <div>
          <p className="text-white font-bold text-lg mb-2">DealSync</p>
          <p className="text-sm">섹터별 전문 AI 심사역 SaaS</p>
          <p className="text-xs mt-4">© 2024 DealSync. All rights reserved.</p>
        </div>
        <div>
          <p className="text-white font-medium mb-3">제품</p>
          <ul className="space-y-1.5 text-sm">
            <li>섹터 에이전트</li>
            <li>양식 재현 엔진</li>
            <li>풀사이클 관리</li>
            <li>가격 정책</li>
          </ul>
        </div>
        <div>
          <p className="text-white font-medium mb-3">지원</p>
          <ul className="space-y-1.5 text-sm">
            <li>이용약관</li>
            <li>개인정보처리방침</li>
            <li>문의: support@dealsync.kr</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
