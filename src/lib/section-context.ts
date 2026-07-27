import { SECTION_META } from "@/types";

interface SectionLike {
  sectionKey: string;
  title: string;
  content: string;
}

function orderOf(sectionKey: string): number {
  return SECTION_META.find((m) => m.key === sectionKey)?.order ?? 999;
}

/**
 * 재생성 대상 섹션보다 앞선 섹션들의 요약을 만든다.
 * 배열 끝에서 자르면 의견종합·별첨이 딸려와 앞 섹션 맥락이 깨진다.
 */
export function buildPriorSectionSummary(
  sections: SectionLike[],
  targetSectionKey: string,
  limit = 4
): string {
  const targetOrder = orderOf(targetSectionKey);

  const preceding = sections
    .filter(
      (s) =>
        s.sectionKey !== targetSectionKey &&
        s.content &&
        orderOf(s.sectionKey) < targetOrder
    )
    .sort((a, b) => orderOf(a.sectionKey) - orderOf(b.sectionKey));

  // 앞선 섹션이 없으면(첫 섹션 재생성) 뒤 섹션 수치라도 참고하도록 일부 제공
  const source =
    preceding.length > 0
      ? preceding.slice(-limit)
      : sections
          .filter((s) => s.sectionKey !== targetSectionKey && s.content)
          .slice(0, limit);

  return source
    .map((s) => {
      const nums = (s.content.match(/[\d,.]+(?:억|조|%|원)?/g) ?? [])
        .slice(0, 5)
        .join(", ");
      return `- ${s.title}: ${s.content.replace(/\s+/g, " ").trim().slice(0, 180)}${
        nums ? ` [수치: ${nums}]` : ""
      }`;
    })
    .join("\n");
}
