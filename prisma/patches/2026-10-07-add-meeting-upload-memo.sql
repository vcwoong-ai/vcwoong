-- Add after 2026-10-06-add-meeting-intelligence.sql; preserves existing records.
ALTER TABLE "Meeting" ADD COLUMN IF NOT EXISTS "uploadMemo" TEXT NOT NULL DEFAULT '';
