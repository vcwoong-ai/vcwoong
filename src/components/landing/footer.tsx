export function Footer() {
  return (
    <footer className="bg-slate-900 text-gray-400 py-12 px-6">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between gap-6">
        <div>
          <div className="text-white font-bold text-lg mb-1">DealSync</div>
          <p className="text-sm">섹터별 전문 AI 심사역 SaaS</p>
          <p className="text-xs mt-2">© 2026 DealSync. All rights reserved.</p>
        </div>
        <div className="grid grid-cols-2 gap-8 text-sm">
          <div className="space-y-2">
            <p className="text-white font-medium">제품</p>
            <p>기능 소개</p>
            <p>가격</p>
            <p>데모</p>
          </div>
          <div className="space-y-2">
            <p className="text-white font-medium">법적</p>
            <p>이용약관</p>
            <p>개인정보처리방침</p>
            <p>문의하기</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
