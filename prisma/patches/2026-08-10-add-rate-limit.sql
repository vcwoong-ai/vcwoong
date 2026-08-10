-- 레이트리밋 카운터 테이블 (2026-08-10)
--
-- 서버리스는 인스턴스마다 메모리가 따로 놀아 in-memory 카운터가 무의미하므로
-- DB를 공유 저장소로 쓴다. 가입·로그인·AI 보고서 생성 폭주를 막는 데 사용.
--
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS 로 작성했다.
-- Neon SQL Editor에 그대로 붙여넣어 실행하면 된다.

CREATE TABLE IF NOT EXISTS "RateLimit" (
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

CREATE INDEX IF NOT EXISTS "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");
