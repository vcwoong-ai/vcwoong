import { cn } from "@/lib/utils";

/**
 * 로딩 자리표시자.
 *
 * 왜 스피너가 아니라 스켈레톤인가: 목록·상세 화면은 서버 컴포넌트가 DB를
 * 조회한 뒤에야 렌더되는데, 그동안 화면이 비어 있으면 "멈춘 것"처럼 보인다.
 * 실제 콘텐츠와 같은 모양의 회색 블록을 먼저 깔아두면 레이아웃이 미리
 * 잡혀서, 데이터가 도착할 때 화면이 튀지 않고 체감 대기도 짧아진다.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      // aria-hidden: 스크린리더가 의미 없는 빈 블록을 읽지 않도록.
      // 로딩 상태는 아래 SkeletonPage의 role="status"가 대신 알린다.
      aria-hidden
      className={cn("animate-pulse rounded-md bg-gray-200/70", className)}
      {...props}
    />
  );
}

/** 카드 한 장 모양 자리표시자 (목록 그리드용) */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn("rounded-xl border border-gray-200 bg-white p-5", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-4/5" />
      </div>
    </div>
  );
}

/** 한 줄짜리 리스트 항목 자리표시자 */
export function SkeletonRow() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4">
      <div className="flex items-center gap-4">
        <Skeleton className="h-9 w-9 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 w-1/4" />
        </div>
        <Skeleton className="h-4 w-12" />
      </div>
    </div>
  );
}

/**
 * 상세 화면 공통 로딩 뼈대 (딜 상세·보고서 상세).
 *
 * 상세 화면은 목록보다 조회량이 많아 대기가 더 길다 — 헤더·탭·본문
 * 자리를 미리 잡아두면 데이터 도착 시 레이아웃이 튀지 않는다.
 */
export function SkeletonDetail({ title }: { title?: string }) {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <span className="sr-only">{title ?? "내용"}을 불러오는 중입니다</span>

      {/* 제목 + 액션 버튼 자리 */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-40" />
        </div>
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>

      {/* 탭 자리 */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-24 rounded-lg" />
        ))}
      </div>

      {/* 본문 자리 */}
      <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3">
        <Skeleton className="h-5 w-1/3" />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className={i % 3 === 2 ? "h-3 w-2/3" : "h-3 w-full"} />
        ))}
      </div>
    </div>
  );
}

/**
 * 목록 화면 공통 로딩 뼈대.
 *
 * 스크린리더 사용자에게는 회색 블록이 아무 의미가 없으므로, 여기서
 * role="status"로 "불러오는 중"이라는 사실만 한 번 알린다.
 */
export function SkeletonPage({
  title,
  variant = "row",
  count = 5,
}: {
  title?: string;
  variant?: "row" | "card";
  count?: number;
}) {
  return (
    <div className="space-y-6" role="status" aria-live="polite">
      <span className="sr-only">{title ?? "내용"}을 불러오는 중입니다</span>

      {/* 헤더 자리 */}
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>

      {variant === "card" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: count }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from({ length: count }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </div>
      )}
    </div>
  );
}
