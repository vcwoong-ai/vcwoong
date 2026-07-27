/**
 * vercel.json 의 functions 경로가 실제 파일과 일치하는지 검사한다.
 * Usage: npm run test:vercel
 *
 * Vercel은 매칭되는 서버리스 함수가 없는 패턴을 만나면 배포를 실패시킨다.
 * 라우트를 옮기거나 지웠을 때 로컬 빌드는 통과하지만 배포만 깨지므로,
 * 오프라인에서 미리 잡아낸다.
 */
import { existsSync, readFileSync } from "fs";
import { resolve } from "path";

function main() {
  console.log("\n=== Axiom vercel.json 검증 ===\n");

  const root = resolve(__dirname, "..");
  const config = JSON.parse(
    readFileSync(resolve(root, "vercel.json"), "utf-8")
  ) as { functions?: Record<string, unknown> };

  const patterns = Object.keys(config.functions ?? {});
  if (patterns.length === 0) {
    console.log("functions 항목 없음 — 검사 생략\n");
    return;
  }

  const missing = patterns.filter((p) => !existsSync(resolve(root, p)));

  if (missing.length > 0) {
    throw new Error(
      `vercel.json 의 functions 경로가 존재하지 않습니다 (배포 실패 원인):\n` +
        missing.map((p) => `  - ${p}`).join("\n")
    );
  }

  console.log(`✅ functions 경로 ${patterns.length}개 모두 존재`);
  console.log("\n✅ vercel.json 검증 통과\n");
}

main();
