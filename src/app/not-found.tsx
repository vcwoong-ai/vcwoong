"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FileQuestion } from "lucide-react";

/**
 * 404 페이지. 없으면 Next.js 기본 흑백 화면이 나와 브랜드가 끊긴다.
 * 삭제된 딜·보고서 링크를 눌렀을 때도 여기로 온다.
 *
 * 로그인 여부로 링크를 분기한다 — 비로그인 방문자(및 크롤러/링크 미리보기
 * 봇)에게 /dashboard, /deals 같은 내부 앱 경로를 노출할 이유가 없고, 어차피
 * 눌러도 로그인 화면으로 막힌다. 로그인 상태에서는 실제로 유용한 복귀
 * 지점이라 그대로 유지한다.
 *
 * 클라이언트 훅(useSession)으로 분기한다 — 서버 컴포넌트에서
 * getServerSession을 쓰면 이 루트 not-found가 dynamic이 되면서 /, /pricing
 * 같은 정적 마케팅 페이지까지 빌드 시 정적 생성이 풀려버린다(전부 ƒ로
 * 바뀌는 회귀를 빌드에서 확인함). 클라이언트 훅은 그 문제가 없다.
 */
export default function NotFound() {
  const { status } = useSession();
  const isAuthenticated = status === "authenticated";

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
          {isAuthenticated ? (
            <>
              <Button asChild>
                <Link href="/dashboard">대시보드로</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/deals">딜 목록</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild>
                <Link href="/">홈으로</Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/login">로그인</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
