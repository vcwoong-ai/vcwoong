-- Targeted repair for confirmed missing PE objects, generated from main a5796bb prisma/schema.prisma.
-- Apply only after catalog preflight, backup and isolated rehearsal. Not idempotent: fail closed on existing objects.
-- No existing VC/auth/billing tables are altered. Existing User/Team/SectionStatus are references only.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public;

CREATE TYPE "MaDealType" AS ENUM ('BUYOUT', 'GROWTH_EQUITY', 'CARVE_OUT', 'MBO', 'SECONDARY', 'MINORITY');

CREATE TYPE "MaDealStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TYPE "MaDocumentType" AS ENUM ('MANAGEMENT_ACCOUNTS', 'DD_MATERIAL', 'FINANCIAL_MODEL', 'CONTRACT', 'OTHER');

CREATE TYPE "MaReportStatus" AS ENUM ('PENDING', 'DRAFT');

CREATE TYPE "MaSectionKey" AS ENUM ('DEAL_OVERVIEW', 'FINANCIAL_NORMALIZATION', 'QOE_ANALYSIS', 'LBO_ANALYSIS', 'DD_SUMMARY', 'RETURNS_ANALYSIS', 'RISK_FACTORS', 'RECOMMENDATION');

CREATE TYPE "MaFinancialPeriodType" AS ENUM ('ANNUAL', 'QUARTERLY', 'TTM');

CREATE TYPE "MaFinancialStatementType" AS ENUM ('INCOME_STATEMENT', 'BALANCE_SHEET', 'CASH_FLOW');

CREATE TYPE "MaFinancialSourceType" AS ENUM ('UPLOADED_DOCUMENT', 'EXCEL', 'DART', 'MANUAL');

CREATE TYPE "MaAdjustmentStatus" AS ENUM ('DRAFT', 'PROPOSED', 'APPROVED', 'REJECTED');

CREATE TYPE "MaAdjustmentType" AS ENUM ('ONE_OFF_EXPENSE', 'OWNER_COMPENSATION_NORMALIZATION', 'RELATED_PARTY_NORMALIZATION', 'RESTRUCTURING', 'ONE_TIME_PROFESSIONAL_FEE', 'NON_RECURRING_OPERATING_COST', 'ONE_OFF_INCOME', 'NON_RECURRING_REVENUE', 'UNSUSTAINABLE_MARGIN', 'OTHER');

CREATE TYPE "PEEvidenceRequestStatus" AS ENUM ('REQUESTED', 'RECEIVED', 'UNDER_REVIEW', 'ACCEPTED', 'REJECTED');

CREATE TYPE "PEICQuestionPriorityDb" AS ENUM ('P0', 'P1', 'P2');

CREATE TYPE "PEICReviewSignoffStatus" AS ENUM ('NOT_REVIEWED', 'IN_REVIEW', 'CHANGES_REQUESTED', 'REVIEWED');

CREATE TYPE "PEICReviewCommentTargetType" AS ENUM ('COMMITTEE_PACK', 'IC_QUESTION', 'REVIEW_ITEM', 'EVIDENCE_REQUEST');

CREATE TYPE "PEICAuditEventType" AS ENUM ('REVIEW_STARTED', 'CHANGE_REQUESTED', 'REVIEW_COMPLETED', 'COMMENT_ADDED', 'EVIDENCE_REQUESTED');

CREATE TYPE "PEDDCaseStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TYPE "PEDDCategory" AS ENUM ('FINANCIAL', 'COMMERCIAL', 'OPERATIONAL', 'LEGAL', 'TAX', 'HR', 'TECHNOLOGY', 'IT_SECURITY', 'REGULATORY', 'ESG', 'MANAGEMENT', 'OTHER');

CREATE TYPE "PEDDSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO');

CREATE TYPE "PEDDFindingStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'CONFIRMED', 'MITIGATED', 'ACCEPTED', 'REJECTED', 'CLOSED');

CREATE TABLE "MADeal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "dealType" "MaDealType" NOT NULL,
    "status" "MaDealStatus" NOT NULL DEFAULT 'ACTIVE',
    "userId" TEXT NOT NULL,
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MADeal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MADocument" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "MaDocumentType" NOT NULL,
    "url" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "parsedText" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MADocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MAReport" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "MaReportStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MAReport_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MAReportSection" (
    "id" TEXT NOT NULL,
    "maReportId" TEXT NOT NULL,
    "sectionKey" "MaSectionKey" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" "SectionStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MAReportSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MAFinancialPeriod" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodType" "MaFinancialPeriodType" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MAFinancialPeriod_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MAFinancialLineItem" (
    "id" TEXT NOT NULL,
    "financialPeriodId" TEXT NOT NULL,
    "statementType" "MaFinancialStatementType" NOT NULL,
    "lineItem" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL,
    "source" "MaFinancialSourceType" NOT NULL,
    "sourceName" TEXT,
    "sourceLocation" TEXT,
    "isNormalized" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MAFinancialLineItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MAFinancialAdjustment" (
    "id" TEXT NOT NULL,
    "financialPeriodId" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "reportedValue" DOUBLE PRECISION NOT NULL,
    "adjustmentValue" DOUBLE PRECISION NOT NULL,
    "normalizedValue" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "source" "MaFinancialSourceType" NOT NULL,
    "sourceName" TEXT,
    "sourceLocation" TEXT,
    "status" "MaAdjustmentStatus" NOT NULL DEFAULT 'APPROVED',
    "adjustmentType" "MaAdjustmentType" NOT NULL DEFAULT 'OTHER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MAFinancialAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PEDDCase" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "status" "PEDDCaseStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PEDDCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PEDDFinding" (
    "id" TEXT NOT NULL,
    "ddCaseId" TEXT NOT NULL,
    "category" "PEDDCategory" NOT NULL,
    "subCategory" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "PEDDSeverity" NOT NULL,
    "status" "PEDDFindingStatus" NOT NULL DEFAULT 'DRAFT',
    "financialPeriodId" TEXT,
    "owner" TEXT,
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PEDDFinding_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PEEvidence" (
    "id" TEXT NOT NULL,
    "ddCaseId" TEXT NOT NULL,
    "findingId" TEXT,
    "documentId" TEXT,
    "sourceType" "MaFinancialSourceType" NOT NULL,
    "sourceName" TEXT NOT NULL,
    "sourceLocation" TEXT,
    "externalReference" TEXT,
    "locator" TEXT,
    "excerpt" TEXT,
    "confidence" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PEEvidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PEEvidenceRequest" (
    "id" TEXT NOT NULL,
    "ddCaseId" TEXT NOT NULL,
    "reviewItemSourceType" TEXT NOT NULL,
    "reviewItemSourceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "requestedDocument" TEXT,
    "requestedFact" TEXT,
    "reason" TEXT NOT NULL,
    "priority" "PEICQuestionPriorityDb" NOT NULL,
    "status" "PEEvidenceRequestStatus" NOT NULL DEFAULT 'REQUESTED',
    "linkedDocumentId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PEEvidenceRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PEICReview" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "status" "PEICReviewSignoffStatus" NOT NULL DEFAULT 'NOT_REVIEWED',
    "comment" TEXT,
    "reviewedFingerprint" TEXT,
    "reviewedFingerprintBreakdown" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PEICReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PEICReviewComment" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "reviewId" TEXT,
    "authorId" TEXT NOT NULL,
    "targetType" "PEICReviewCommentTargetType" NOT NULL,
    "targetId" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PEICReviewComment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PEICReviewSnapshot" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "fingerprintBreakdown" TEXT NOT NULL,
    "openQuestionCodes" TEXT NOT NULL,
    "openQuestionCount" INTEGER NOT NULL,
    "openP0Count" INTEGER NOT NULL,
    "comment" TEXT,
    "reviewedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PEICReviewSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PEICAuditEvent" (
    "id" TEXT NOT NULL,
    "maDealId" TEXT NOT NULL,
    "reviewSnapshotId" TEXT,
    "actorId" TEXT NOT NULL,
    "eventType" "PEICAuditEventType" NOT NULL,
    "targetType" TEXT,
    "targetId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PEICAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MADeal_userId_idx" ON "MADeal"("userId");

CREATE INDEX "MADeal_teamId_idx" ON "MADeal"("teamId");

CREATE INDEX "MADeal_status_idx" ON "MADeal"("status");

CREATE INDEX "MADocument_maDealId_idx" ON "MADocument"("maDealId");

CREATE INDEX "MAReport_maDealId_idx" ON "MAReport"("maDealId");

CREATE INDEX "MAReport_status_idx" ON "MAReport"("status");

CREATE INDEX "MAReportSection_maReportId_idx" ON "MAReportSection"("maReportId");

CREATE INDEX "MAFinancialPeriod_maDealId_idx" ON "MAFinancialPeriod"("maDealId");

CREATE INDEX "MAFinancialPeriod_fiscalYear_idx" ON "MAFinancialPeriod"("fiscalYear");

CREATE UNIQUE INDEX "MAFinancialPeriod_maDealId_fiscalYear_periodType_key" ON "MAFinancialPeriod"("maDealId", "fiscalYear", "periodType");

CREATE INDEX "MAFinancialLineItem_financialPeriodId_idx" ON "MAFinancialLineItem"("financialPeriodId");

CREATE INDEX "MAFinancialLineItem_financialPeriodId_lineItem_idx" ON "MAFinancialLineItem"("financialPeriodId", "lineItem");

CREATE INDEX "MAFinancialAdjustment_financialPeriodId_idx" ON "MAFinancialAdjustment"("financialPeriodId");

CREATE UNIQUE INDEX "PEDDCase_maDealId_key" ON "PEDDCase"("maDealId");

CREATE INDEX "PEDDCase_maDealId_idx" ON "PEDDCase"("maDealId");

CREATE INDEX "PEDDFinding_ddCaseId_idx" ON "PEDDFinding"("ddCaseId");

CREATE INDEX "PEDDFinding_financialPeriodId_idx" ON "PEDDFinding"("financialPeriodId");

CREATE INDEX "PEDDFinding_status_idx" ON "PEDDFinding"("status");

CREATE INDEX "PEEvidence_ddCaseId_idx" ON "PEEvidence"("ddCaseId");

CREATE INDEX "PEEvidence_findingId_idx" ON "PEEvidence"("findingId");

CREATE INDEX "PEEvidence_documentId_idx" ON "PEEvidence"("documentId");

CREATE INDEX "PEEvidenceRequest_ddCaseId_idx" ON "PEEvidenceRequest"("ddCaseId");

CREATE INDEX "PEEvidenceRequest_reviewItemSourceType_reviewItemSourceId_idx" ON "PEEvidenceRequest"("reviewItemSourceType", "reviewItemSourceId");

CREATE INDEX "PEEvidenceRequest_linkedDocumentId_idx" ON "PEEvidenceRequest"("linkedDocumentId");

CREATE INDEX "PEICReview_maDealId_idx" ON "PEICReview"("maDealId");

CREATE UNIQUE INDEX "PEICReview_maDealId_reviewerId_key" ON "PEICReview"("maDealId", "reviewerId");

CREATE INDEX "PEICReviewComment_maDealId_idx" ON "PEICReviewComment"("maDealId");

CREATE INDEX "PEICReviewComment_targetType_targetId_idx" ON "PEICReviewComment"("targetType", "targetId");

CREATE INDEX "PEICReviewComment_reviewId_idx" ON "PEICReviewComment"("reviewId");

CREATE INDEX "PEICReviewSnapshot_maDealId_createdAt_idx" ON "PEICReviewSnapshot"("maDealId", "createdAt");

CREATE UNIQUE INDEX "PEICReviewSnapshot_maDealId_version_key" ON "PEICReviewSnapshot"("maDealId", "version");

CREATE INDEX "PEICAuditEvent_maDealId_createdAt_idx" ON "PEICAuditEvent"("maDealId", "createdAt");

CREATE INDEX "PEICAuditEvent_actorId_createdAt_idx" ON "PEICAuditEvent"("actorId", "createdAt");

CREATE INDEX "PEICAuditEvent_reviewSnapshotId_idx" ON "PEICAuditEvent"("reviewSnapshotId");

ALTER TABLE "MADeal" ADD CONSTRAINT "MADeal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MADeal" ADD CONSTRAINT "MADeal_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MADocument" ADD CONSTRAINT "MADocument_maDealId_fkey" FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MAReport" ADD CONSTRAINT "MAReport_maDealId_fkey" FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MAReportSection" ADD CONSTRAINT "MAReportSection_maReportId_fkey" FOREIGN KEY ("maReportId") REFERENCES "MAReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MAFinancialPeriod" ADD CONSTRAINT "MAFinancialPeriod_maDealId_fkey" FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MAFinancialLineItem" ADD CONSTRAINT "MAFinancialLineItem_financialPeriodId_fkey" FOREIGN KEY ("financialPeriodId") REFERENCES "MAFinancialPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MAFinancialAdjustment" ADD CONSTRAINT "MAFinancialAdjustment_financialPeriodId_fkey" FOREIGN KEY ("financialPeriodId") REFERENCES "MAFinancialPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PEDDCase" ADD CONSTRAINT "PEDDCase_maDealId_fkey" FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PEDDFinding" ADD CONSTRAINT "PEDDFinding_ddCaseId_fkey" FOREIGN KEY ("ddCaseId") REFERENCES "PEDDCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PEDDFinding" ADD CONSTRAINT "PEDDFinding_financialPeriodId_fkey" FOREIGN KEY ("financialPeriodId") REFERENCES "MAFinancialPeriod"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PEEvidence" ADD CONSTRAINT "PEEvidence_ddCaseId_fkey" FOREIGN KEY ("ddCaseId") REFERENCES "PEDDCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PEEvidence" ADD CONSTRAINT "PEEvidence_findingId_fkey" FOREIGN KEY ("findingId") REFERENCES "PEDDFinding"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PEEvidence" ADD CONSTRAINT "PEEvidence_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "MADocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PEEvidenceRequest" ADD CONSTRAINT "PEEvidenceRequest_ddCaseId_fkey" FOREIGN KEY ("ddCaseId") REFERENCES "PEDDCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PEEvidenceRequest" ADD CONSTRAINT "PEEvidenceRequest_linkedDocumentId_fkey" FOREIGN KEY ("linkedDocumentId") REFERENCES "MADocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PEICReview" ADD CONSTRAINT "PEICReview_maDealId_fkey" FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PEICReview" ADD CONSTRAINT "PEICReview_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PEICReviewComment" ADD CONSTRAINT "PEICReviewComment_maDealId_fkey" FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PEICReviewComment" ADD CONSTRAINT "PEICReviewComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PEICReviewComment" ADD CONSTRAINT "PEICReviewComment_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "PEICReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PEICReviewSnapshot" ADD CONSTRAINT "PEICReviewSnapshot_maDealId_fkey" FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PEICReviewSnapshot" ADD CONSTRAINT "PEICReviewSnapshot_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PEICAuditEvent" ADD CONSTRAINT "PEICAuditEvent_maDealId_fkey" FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PEICAuditEvent" ADD CONSTRAINT "PEICAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PEICAuditEvent" ADD CONSTRAINT "PEICAuditEvent_reviewSnapshotId_fkey" FOREIGN KEY ("reviewSnapshotId") REFERENCES "PEICReviewSnapshot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
COMMIT;
