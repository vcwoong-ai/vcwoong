import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext, dealWriteWhere } from "@/lib/team-access";

const ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "text/plain",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

/**
 * Vercel 서버리스 함수는 요청 본문이 4.5MB를 넘으면 플랫폼 단에서 차단하므로,
 * 큰 파일은 브라우저에서 Vercel Blob으로 직접 업로드한다. 이 라우트는 그 업로드를
 * 허가하는 클라이언트 토큰만 발급한다(파일 바이트 자체는 이 서버를 거치지 않음).
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }
  const userId = session.user.id;

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const payload = clientPayload ? JSON.parse(clientPayload) : {};
        const dealId = payload.dealId as string | undefined;
        if (!dealId) {
          throw new Error("딜 ID가 필요합니다");
        }

        const { teamId, role } = await getUserTeamContext(userId);
        const deal = await prisma.deal.findFirst({
          where: { id: dealId, ...dealWriteWhere(userId, teamId, role) },
        });
        if (!deal) {
          throw new Error("이 딜에 파일을 업로드할 권한이 없습니다");
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: false,
          tokenPayload: JSON.stringify({ dealId, userId }),
        };
      },
      onUploadCompleted: async () => {
        // 문서 레코드 생성·본문 파싱은 클라이언트가 이어서 호출하는
        // POST /api/upload(JSON, blobUrl)에서 처리한다.
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "업로드 토큰 생성 실패" },
      { status: 400 }
    );
  }
}
