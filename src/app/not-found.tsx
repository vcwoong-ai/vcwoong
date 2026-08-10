import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

/**
 * 404 페이지. 없으면 Next.js 기본 흑백 화면이 나와 브랜드가 끊긴다.
 * 삭제된 딜·보고서 링크를 눌렀을 때도 여기로 온다.
 */
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="text-center max-w-md">
        <FileQuestion className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-900 mb-2">
          페이지를 찾을 수 없습니다
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          주소가 바뀌었거나 삭제된 항목일 수 있습니다.
        </p>
        <div className="flex gap-3 justify-center">
          <Button asChild>
            <Link href="/dashboard">대시보드로</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/deals">딜 목록</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
