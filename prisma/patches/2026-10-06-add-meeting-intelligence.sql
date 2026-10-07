-- CreateTable
-- Additive meeting intelligence only. Apply to a reviewed database once; never seed operating data.
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "dealId" TEXT,
    "maDealId" TEXT,
    "title" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "participants" TEXT NOT NULL,
    "consentAt" TIMESTAMP(3) NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "uploadRef" TEXT NOT NULL,
    "storageRef" TEXT,
    "originalDeletedAt" TIMESTAMP(3),
    "sha256" TEXT,
    "durationSeconds" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'UPLOAD_PENDING',
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "providerStartedAt" TIMESTAMP(3),
    "transcript" TEXT,
    "minutes" TEXT,
    "errorCode" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingUsageAdmission" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingUsageAdmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingRevision" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "minutes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeetingRevision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_storageKey_key" ON "Meeting"("storageKey");

-- CreateIndex
CREATE INDEX "Meeting_dealId_createdAt_idx" ON "Meeting"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "Meeting_maDealId_createdAt_idx" ON "Meeting"("maDealId", "createdAt");

-- CreateIndex
CREATE INDEX "Meeting_status_leaseUntil_idx" ON "Meeting"("status", "leaseUntil");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_createdByUserId_requestId_key" ON "Meeting"("createdByUserId", "requestId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingUsageAdmission_meetingId_key" ON "MeetingUsageAdmission"("meetingId");

-- CreateIndex
CREATE INDEX "MeetingUsageAdmission_ownerUserId_month_status_idx" ON "MeetingUsageAdmission"("ownerUserId", "month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingRevision_meetingId_version_key" ON "MeetingRevision"("meetingId", "version");

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_maDealId_fkey" FOREIGN KEY ("maDealId") REFERENCES "MADeal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingUsageAdmission" ADD CONSTRAINT "MeetingUsageAdmission_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingRevision" ADD CONSTRAINT "MeetingRevision_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "Meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Orphan rows retain the ledger after parent deletion; a live meeting cannot belong to both tracks.
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_one_track_check" CHECK ("dealId" IS NULL OR "maDealId" IS NULL);
ALTER TABLE "MeetingUsageAdmission" ADD CONSTRAINT "MeetingUsageAdmission_seconds_check" CHECK ("seconds" >= 0);
