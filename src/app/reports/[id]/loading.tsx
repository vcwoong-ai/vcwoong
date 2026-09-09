import { AppLayout } from "@/components/layout/app-layout";
import { SkeletonDetail } from "@/components/ui/skeleton";

/**
 * 상세 화면은 목록보다 조회량이 많아 대기가 길다 — 자리표시자를 먼저
 * 깔아 화면이 멈춘 것처럼 보이지 않게 한다.
 *
 * AppLayout을 여기서도 감싸는 이유: AppLayout이 layout.tsx가 아니라 각
 * 페이지 안에서 import되는 구조라, 껍데기가 없으면 로딩 중에 사이드바가
 * 사라졌다 다시 나타난다.
 */
export default function Loading() {
  return (
    <AppLayout title="보고서">
      <SkeletonDetail title="보고서" />
    </AppLayout>
  );
}
