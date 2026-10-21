/**
 * DB를 깨우지 않는 업타임 확인용 경로.
 * DB 연결 상태는 기존 /api/health에서 별도로 확인한다.
 * Prisma/AI 모듈을 import하지 않아 이 경로 자체는 DB에 연결하지 않는다.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(
    { status: "ok", check: "liveness" },
    { headers: { "Cache-Control": "no-store" } }
  );
}
