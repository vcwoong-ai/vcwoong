import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkQuota } from "@/lib/quotas";

const ALLOWED_CONTENT_TYPES = [
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/msword",
  "application/vnd.ms-powerpoint",
];

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

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

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const quota = await checkQuota(userId, "template");
        if (!quota.allowed) {
          throw new Error(quota.message);
        }

        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: MAX_FILE_SIZE,
          addRandomSuffix: false,
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
