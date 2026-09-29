import { getServerSession } from "next-auth";
import { redirect, notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { getUserTeamContext } from "@/lib/team-access";
import { loadPECommitteePackForDeal } from "@/lib/pe/pe-committee-pack-loader";
import { buildPECommitteePackMarkdown } from "@/lib/pe/pe-committee-pack-memo";
import { PrintCommitteePackClient } from "./print-committee-pack-client";

/**
 * PE Committee Pack 인쇄/PDF 뷰(PR #110, §Step6). 대시보드 레이아웃을
 * 그대로 재사용하지 않는다 — lp-report/[id]/print와 동일한 패턴(마크다운
 * + 인쇄 전용 CSS)으로 완전히 별도의 화면을 만든다. 화면("위원회 자료"
 * 탭)/DOCX/PPTX와 정확히 같은 `buildPECommitteePack()`(pe-committee-pack-
 * loader.ts) 결과에서 마크다운만 뽑아 쓴다 — 데이터를 다시 조립하지 않는다.
 */
export default async function CommitteePackPrintPage({ params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { teamId, role } = await getUserTeamContext(session.user.id);
  const result = await loadPECommitteePackForDeal({ userId: session.user.id, teamId, role }, params.id);
  if (result.status === "not_found") notFound();

  const { maDeal, pack } = result.data;
  const markdown = buildPECommitteePackMarkdown(pack);

  return (
    <PrintCommitteePackClient
      companyName={maDeal.companyName}
      dealName={maDeal.name}
      generatedAt={pack.generatedAt}
      markdown={markdown}
      maDealId={maDeal.id}
    />
  );
}
