/**
 * Pretendard(한글 폰트) 정적 자산을 public/으로 꺼내온다.
 *
 * 왜 빌드 때 만드는가 — woff2 서브셋이 368개(5.5MB)라 저장소에 그대로
 * 커밋하면 클론·diff가 무거워진다. `pretendard`는 이미 npm 의존성이므로
 * node_modules에서 필요한 것만 골라 복사하는 편이 깔끔하다.
 *
 * 왜 next/font/local이 아닌가 — 다이나믹 서브셋은 파일마다 unicode-range가
 * 다른데 next/font/local은 파일별 unicode-range 지정을 지원하지 않는다.
 * 통짜 폰트(웨이트당 750KB)를 받는 대신 실제 쓰인 글자 구간만 받으려면
 * @font-face를 직접 쓸 수밖에 없다.
 *
 * postinstall에서 자동 실행된다. 폰트 패키지가 없으면(설치 실패 등) 조용히
 * 건너뛴다 — 폰트 때문에 빌드 전체가 죽는 것보다 시스템 폰트로 뜨는 게 낫다.
 */
import { existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, readdirSync } from "fs";
import path from "path";

/** 실제로 쓰는 웨이트만. 9개 전부 복사하면 파일이 800개를 넘는다. */
const WEIGHTS: Array<[name: string, weight: number]> = [
  ["Regular", 400],
  ["Medium", 500],
  ["SemiBold", 600],
  ["Bold", 700],
];

const SRC = "node_modules/pretendard/dist/web/static";
const OUT = "public/fonts/pretendard";

function main() {
  const subsetDir = path.join(SRC, "woff2-dynamic-subset");
  if (!existsSync(subsetDir)) {
    console.log("[fonts] pretendard 패키지를 찾지 못해 건너뜁니다");
    return;
  }

  mkdirSync(OUT, { recursive: true });

  const available = new Set(readdirSync(subsetDir));
  const faces: string[] = [];
  let copied = 0;

  for (const [name, weight] of WEIGHTS) {
    // 서브셋 번호는 0..N으로 이어지는데, 개수는 폰트 버전마다 달라질 수
    // 있으니 하드코딩하지 않고 실제 파일 목록에서 추린다.
    const files = [...available]
      .filter((f) => f.startsWith(`Pretendard-${name}.subset.`) && f.endsWith(".woff2"))
      .sort((a, b) => subsetIndex(a) - subsetIndex(b));

    for (const file of files) {
      copyFileSync(path.join(subsetDir, file), path.join(OUT, file));
      copied += 1;
      const range = unicodeRangeFor(name, file);
      if (!range) continue;
      faces.push(
        `@font-face{font-family:'Pretendard';font-style:normal;font-display:swap;` +
          `font-weight:${weight};` +
          `src:url(/fonts/pretendard/${file}) format('woff2');` +
          `unicode-range:${range};}`
      );
    }
  }

  const licenseSrc = "node_modules/pretendard/dist/LICENSE.txt";
  if (existsSync(licenseSrc)) {
    copyFileSync(licenseSrc, path.join(OUT, "LICENSE.txt"));
  }

  writeFileSync(
    path.join(OUT, "pretendard.css"),
    `/* 자동 생성 — tools/setup-fonts.ts. 직접 고치지 말 것.\n` +
      `   Pretendard ${faces.length} subsets (${WEIGHTS.map(([, w]) => w).join("/")}), SIL OFL 1.1 */\n` +
      faces.join("\n") +
      "\n"
  );

  console.log(`[fonts] Pretendard ${copied}개 서브셋 복사, @font-face ${faces.length}개 생성`);
}

function subsetIndex(file: string): number {
  return Number(/\.subset\.(\d+)\.woff2$/.exec(file)?.[1] ?? 0);
}

/**
 * unicode-range는 폰트 패키지가 함께 배포하는 CSS에만 들어 있다.
 * 웨이트별 CSS(Pretendard-Regular.css 등)에서 해당 서브셋 블록을 찾아 뽑아온다.
 */
const rangeCache = new Map<string, Map<string, string>>();
function unicodeRangeFor(weightName: string, file: string): string | undefined {
  if (!rangeCache.has(weightName)) {
    const map = new Map<string, string>();
    // 전체 다이나믹 서브셋 CSS 한 벌에 모든 웨이트가 들어 있다.
    const cssPath = path.join(SRC, "pretendard-dynamic-subset.css");
    if (existsSync(cssPath)) {
      const css = readFileSync(cssPath, "utf8");
      for (const block of css.split("@font-face").slice(1)) {
        const body = block.slice(0, block.indexOf("}") + 1);
        const f = /woff2-dynamic-subset\/([^)]+\.woff2)/.exec(body)?.[1];
        const r = /unicode-range:\s*([^;]+);/.exec(body)?.[1];
        if (f && r) map.set(f, r.trim());
      }
    }
    rangeCache.set(weightName, map);
  }
  return rangeCache.get(weightName)!.get(file);
}

main();
