/**
 * 딜 섹터·단계 한글 라벨 — 단일 소스.
 *
 * 예전엔 이 라벨 문자열이 deal-card.tsx·deal-kanban.tsx·edit-deal-dialog.tsx·
 * dashboard/page.tsx 네 곳에 따로 복사돼 있었다. 그래서 파이프라인 단계명을
 * 바꿀 때(검토/IR 예정/투자심의위원회) 한 곳을 빠뜨려도 타입 에러가 안
 *나고, 실제로 딜 상세 페이지 헤더는 놓쳐서 "IC_PREP"라는 enum 원본값이
 * 그대로 화면에 노출됐다. 라벨 텍스트만 여기 하나로 모으고, 각 화면의
 * 색상·배지 스타일은 화면별로 유지한다(용도가 서로 달라 그건 합칠
 * 이유가 없다).
 */
import { DealSector, DealStage } from "@prisma/client";

export const SECTOR_LABEL: Record<DealSector, string> = {
  BIO: "바이오",
  IT: "IT/SaaS",
  DEEPTECH: "AI/딥테크",
  MANUFACTURING: "제조",
  CONTENT: "콘텐츠",
  FINTECH: "핀테크",
  CONSUMER: "소비재",
  CLIMATE: "기후/ESG",
  GENERAL: "일반",
};

export const STAGE_LABEL: Record<DealStage, string> = {
  SCREENING: "검토",
  DEEP_DIVE: "IR 예정",
  IC_PREP: "투자심의위원회",
  IC_REVIEW: "IR 심의",
  CLOSED: "투자 완료",
  REJECTED: "거절",
};
