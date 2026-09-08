import { AppLayout } from "@/components/layout/app-layout";
import { SkeletonPage } from "@/components/ui/skeleton";

/**
 * 이 화면은 서버 컴포넌트가 DB를 조회한 뒤에야 렌더된다. loading.tsx가
 * 없으면 그동안 화면이 비어 있어 "멈춘 것"처럼 보인다.
 *
 * AppLayout을 여기서도 감싸는 이유: AppLayout이 layout.tsx가 아니라 각
 * 페이지 안에서 import되는 구조라, 껍데기를 씌우지 않으면 로딩 중에
 * 사이드바·헤더가 통째로 사라졌다 다시 나타난다.
 */
export default function Loading() {
  return (
    <AppLayout title="딜소싱">
      <SkeletonPage title="딜소싱" variant="row" count={5} />
    </AppLayout>
  );
}
