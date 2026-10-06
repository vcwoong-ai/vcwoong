import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkQuota } from "@/lib/quotas";
import { createUploadGrant, verifyUploadGrant } from "@/lib/upload-security";
import { assertPrivateBlobUploads } from "@/lib/storage";

/**
 * Vercel 서버리스 함수는 요청 본문이 4.5MB를 넘으면 플랫폼 단에서 차단하므로,
 * 큰 템플릿 파일은 브라우저에서 Vercel Blob으로 직접 업로드한다.
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
      const quota = await checkQuota(userId, "template");
      if (!quota.allowed) return NextResponse.json({ error: quota.message }, { status: 429 });
      return NextResponse.json(createUploadGrant({ userId, scope: "template", fileName: body.fileName, mimeType: body.mimeType, fileSize: body.fileSize }));
    }
    if (body.type !== "blob.generate-client-token") return NextResponse.json({ error: "잘못된 요청입니다" }, { status: 400 });
    const jsonResponse = await handleUpload({
      body: body as HandleUploadBody,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const payload = clientPayload ? JSON.parse(clientPayload) : {};
        const claims = verifyUploadGrant(payload.binding, userId, "template");
        if (claims.pathname !== pathname) throw new Error("업로드 승인과 경로가 다릅니다");
        const quota = await checkQuota(userId, "template");
        if (!quota.allowed) {
          throw new Error(quota.message);
        }

        return {
          allowedContentTypes: [claims.mimeType],
          maximumSizeInBytes: claims.fileSize,
          validUntil: claims.expiresAt,
          addRandomSuffix: false,
          allowOverwrite: false,
          tokenPayload: JSON.stringify({ userId }),
        };
      },
      onUploadCompleted: async () => {
        // 템플릿 레코드 생성·구조 분석은 클라이언트가 이어서 호출하는
        // POST /api/templates(JSON, blobUrl)에서 처리한다.
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
