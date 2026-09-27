-- QoE Adjustment status/adjustmentType persistence (2026-09-23)
--
-- DealMind PE Track PR-D.1. PR-D(QoE Engine)의 QoEAdjustmentStatus/
-- QoEAdjustmentType(qoe-types.ts)은 지금까지 in-memory TypeScript 타입으로만
-- 존재했다 — 이 패치는 그 두 개념을 MAFinancialAdjustment에 컬럼으로
-- 추가한다. 기존 테이블·컬럼은 하나도 변경/삭제하지 않는다.
--
-- 기존 row 처리 정책(왜 DRAFT가 아니라 APPROVED로 초기화하는가):
-- 이 컬럼이 생기기 전까지 MAFinancialAdjustment는 상태 개념이 전혀 없었고,
-- PR-B의 정규화 엔진(deriveAdjustedEbitda)은 전달받은 조정을 무조건 전부
-- 합산했다 — 즉 지금까지 존재하는 모든 row는 사실상 이미 "승인되어 반영
-- 중인" 상태였다. 이 마이그레이션 시점에 DRAFT/PROPOSED로 초기화하면
-- 기존 딜의 Adjusted EBITDA가 이 패치 적용 순간 조용히 줄어드는(계산에서
-- 빠지는) 부작용이 생긴다 — 스키마 추가만으로 이미 계산된 재무 수치가
-- 바뀌는 것이 "보수적"이 아니라고 판단해 APPROVED를 기본값으로 한다.
-- adjustmentType은 기존 row에 분류 정보가 전혀 없었으므로 실제로 모르는
-- 값을 지어내지 않고 OTHER로 초기화한다.
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS로 작성했다.
-- Neon SQL Editor에 그대로 붙여넣어 실행하면 된다.
-- (이 패치는 이 세션에서 실제 DB에 실행하지 않았다 — prisma validate/generate로만
-- 스키마 정합성을 확인했다. 실행은 저장소 관례대로 별도로 진행한다.)

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "MaAdjustmentStatus" AS ENUM ('DRAFT', 'PROPOSED', 'APPROVED', 'REJECTED');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE "MaAdjustmentType" AS ENUM (
        'ONE_OFF_EXPENSE',
        'OWNER_COMPENSATION_NORMALIZATION',
        'RELATED_PARTY_NORMALIZATION',
        'RESTRUCTURING',
        'ONE_TIME_PROFESSIONAL_FEE',
        'NON_RECURRING_OPERATING_COST',
        'ONE_OFF_INCOME',
        'NON_RECURRING_REVENUE',
        'UNSUSTAINABLE_MARGIN',
        'OTHER'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable(추가만 — 기존 컬럼·row 변경/삭제 없음. DEFAULT가 있어 기존
-- row도 안전하게 채워진다)
ALTER TABLE "MAFinancialAdjustment"
    ADD COLUMN IF NOT EXISTS "status" "MaAdjustmentStatus" NOT NULL DEFAULT 'APPROVED';

ALTER TABLE "MAFinancialAdjustment"
    ADD COLUMN IF NOT EXISTS "adjustmentType" "MaAdjustmentType" NOT NULL DEFAULT 'OTHER';
