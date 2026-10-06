import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamContext, dealWriteWhere } from "@/lib/team-access";
import { createUploadGrant, verifyUploadGrant, type UploadFileInput } from "@/lib/upload-security";
import { assertPrivateBlobUploads } from "@/lib/storage";

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

  try {
    assertPrivateBlobUploads();
    const body = await request.json();
    if (body.type === "upload.prepare") {
      const { dealId, fileName, mimeType, fileSize } = body as UploadFileInput & { dealId: string };
      if (typeof dealId !== "string" || !/^[A-Za-z0-9_-]+$/.test(dealId)) return NextResponse.json({ error: "딜 ID가 필요합니다" }, { status: 400 });
      const { teamId, role } = await getUserTeamContext(userId);
      const deal = await prisma.deal.findFirst({ where: { id: dealId, ...dealWriteWhere(userId, teamId, role) } });
      if (!deal) return NextResponse.json({ error: "업로드 권한이 없습니다" }, { status: 403 });
      return NextResponse.json(createUploadGrant({ userId, scope: "deal", resourceId: dealId, fileName, mimeType, fileSize }));
    }
    if (body.type !== "blob.generate-client-token") return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
    const jsonResponse = await handleUpload({
      body: body as HandleUploadBody,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = clientPayload ? JSON.parse(clientPayload) : {};
        const dealId = payload.dealId as string | undefined;
        if (!dealId) {
          throw new Error("딜 ID가 필요합니다");
        }
        const claims = verifyUploadGrant(payload.binding, userId, "deal", dealId);
        if (claims.pathname !== pathname) throw new Error("업로드 승인과 경로가 다릅니다");

        const { teamId, role } = await getUserTeamContext(userId);
        const deal = await prisma.deal.findFirst({
          where: { id: dealId, ...dealWriteWhere(userId, teamId, role) },
        });
        if (!deal) {
          throw new Error("이 딜에 파일을 업로드할 권한이 없습니다");
        }

        return {
          allowedContentTypes: [claims.mimeType],
          maximumSizeInBytes: claims.fileSize,
          validUntil: claims.expiresAt,
          addRandomSuffix: false,
          allowOverwrite: false,
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
