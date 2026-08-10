import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteStoredFile } from "@/lib/storage";
import {
  getUserTeamContext,
  dealWriteWhere,
  permissionDeniedMessage,
} from "@/lib/team-access";

/**
 * 업로드한 문서 삭제.
 *
 * 파싱이 실패했거나 잘못 올린 파일을 지울 방법이 없으면, 사용자는 그 딜의
 * 자료를 영영 고칠 수 없다(이미지 위주 PDF처럼 추출이 0자인 경우 등).
 * DB 레코드와 함께 스토리지 실물도 지워 Blob에 고아 파일이 쌓이지 않게 한다.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "인증이 필요합니다" }, { status: 401 });
  }

  const { teamId, role } = await getUserTeamContext(session.user.id);

  // 문서 자체엔 소유자가 없으므로 딜 편집 권한으로 판단한다.
  const document = await prisma.document.findFirst({
    where: {
      id: params.id,
      deal: dealWriteWhere(session.user.id, teamId, role),
    },
    select: { id: true, url: true, name: true },
  });

  if (!document) {
    return NextResponse.json(
      { error: permissionDeniedMessage("edit") },
      { status: 403 }
    );
  }

  // 실물 파일부터 지운다. 실패해도(이미 없는 파일 등) 레코드 삭제는 진행한다.
  await deleteStoredFile(document.url);
  await prisma.document.delete({ where: { id: document.id } });

  return NextResponse.json({ message: "문서가 삭제되었습니다" });
}
