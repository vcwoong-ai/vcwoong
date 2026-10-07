// Explicit public sample lookups only. Never prints keys, URLs or provider diagnostics.
const args = process.argv.slice(2);
if (args.some((arg) => !["--dart", "--kipris"].includes(arg)) || args.length > 1) {
  console.error("사용법: npm run services:check [-- --dart | -- --kipris]");
  process.exitCode = 1;
} else {
  console.log(`DART 키 설정: ${process.env.DART_API_KEY?.trim() ? "있음" : "없음"}`);
  console.log(`KIPRIS 키 설정: ${process.env.KIPRIS_API_KEY?.trim() ? "있음" : "없음"}`);
  if (args.length === 0) {
    console.log("설정 존재만 확인했습니다. 외부 API를 호출하지 않았습니다.");
  } else if (args.includes("--kipris")) {
    if (!process.env.KIPRIS_API_KEY?.trim()) {
      console.error(".env.services.local에 KIPRIS_API_KEY가 필요합니다.");
      process.exitCode = 1;
    } else {
      try {
        const url = new URL("https://plus.kipris.or.kr/openapi/rest/patUtiModInfoSearchSevice/applicantNameSearchInfo");
        url.search = new URLSearchParams({ applicant: "삼성전자", accessKey: process.env.KIPRIS_API_KEY.trim(),
          docsStart: "1", docsCount: "1", patent: "true", utility: "true" }).toString();
        const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "error" });
        const xml = await response.text();
        const code = xml.match(/<resultCode\b[^>]*>([^<]*)<\/resultCode>/i)?.[1].trim();
        const hasPatent = /<(?:PatentUtilityInfo|item)\b/i.test(xml)
          && /<ApplicationNumber\b[^>]*>\s*[^<\s]/i.test(xml)
          && /<(?:InventionName|inventionTitle)\b[^>]*>\s*[^<\s]/i.test(xml);
        if (!response.ok || (code && !["00", "000", "0"].includes(code)) || !hasPatent) {
          console.error("KIPRIS 공개 특허 예제 조회를 확인하지 못했습니다. 해당 서비스 이용 승인·키·한도를 확인하세요.");
          process.exitCode = 1;
        } else console.log("KIPRIS 공개 출원인 예제 조회 성공. 운영 DB 반영은 수행하지 않았습니다.");
      } catch {
        console.error("KIPRIS 연결 확인 실패. 네트워크 또는 응답 형식을 확인하세요.");
        process.exitCode = 1;
      }
    }
  } else if (!process.env.DART_API_KEY?.trim()) {
    console.error(".env.services.local에 DART_API_KEY가 필요합니다.");
    process.exitCode = 1;
  } else {
    try {
      const url = new URL("https://opendart.fss.or.kr/api/company.json");
      url.search = new URLSearchParams({ crtfc_key: process.env.DART_API_KEY.trim(), corp_code: "00126380" }).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: "error" });
      const data = await response.json();
      if (!response.ok || data.status !== "000" || data.stock_code !== "005930") {
        console.error("DART 공식 예제 조회를 확인하지 못했습니다. 인증 상태·IP 설정·한도를 확인하세요.");
        process.exitCode = 1;
      } else console.log("DART 공개 기업 예제 조회 성공 (정상 코드 000). 운영 DB 반영은 수행하지 않았습니다.");
    } catch {
      console.error("DART 연결 확인 실패. 네트워크 또는 응답 형식을 확인하세요.");
      process.exitCode = 1;
    }
  }
}
