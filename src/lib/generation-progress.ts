/**
 * 보고서 생성 진행 상황 — Report.currentSectionTitle 컬럼에 저장한다.
 *
 * 예전엔 in-memory Map이었는데, Vercel 서버리스에서는 /run(쓰기)과
 * /status(읽기)가 각각 다른 인스턴스에서 실행될 수 있어 한 인스턴스가 적은
 * 진행률을 다른 인스턴스가 보지 못하는 문제가 있었다. 완성된 섹션 수는 이미
 * ReportSection 테이블(DB)로 세고 있으므로, 여기서는 "지금 어느 섹션을
 * 만들고 있는지"만 Report 행에 얹어 모든 인스턴스가 같은 값을 보게 한다.
 *
 * 실패해도 진행률 문구가 살짝 부정확해질 뿐 생성 자체는 계속돼야 하므로
 * 쓰기는 fire-and-forget(.catch 무시)이다 — 호출부가 await로 기다릴 필요가
 * 없어 섹션 루프의 타이밍에 영향을 주지 않는다.
 */
import { prisma } from "./prisma";

export function setCurrentSection(
  reportId: string,
  sectionTitle: string | null
): void {
  prisma.report
    .update({ where: { id: reportId }, data: { currentSectionTitle: sectionTitle } })
    .catch(() => {});
}
