/** 환경변수는 이 파일에서만 읽는다. 필수값이 비면 호출 시점에 명확한 오류를 낸다. */

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 이(가) 설정되지 않았습니다. .env.example 을 참고하세요.`);
  return v;
}

export const env = {
  get appUrl() {
    return required("APP_URL").replace(/\/+$/, "");
  },
  get clientId() {
    return required("CAFE24_CLIENT_ID");
  },
  get clientSecret() {
    return required("CAFE24_CLIENT_SECRET");
  },
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get sessionSecret() {
    const v = required("SESSION_SECRET");
    if (v.length < 32) throw new Error("SESSION_SECRET 은 32자 이상이어야 합니다.");
    return v;
  },
  get cronSecret() {
    return process.env.CRON_SECRET || "";
  },
  get billingMode(): "off" | "cafe24" {
    return process.env.BILLING_MODE === "cafe24" ? "cafe24" : "off";
  },
  get proPriceKrw() {
    return Number(process.env.PRO_PRICE_KRW || 19900);
  },
  get freeMonthlyResponses() {
    return Number(process.env.FREE_MONTHLY_RESPONSES || 100);
  },
  get appStoreUrl() {
    return process.env.APP_STORE_URL || "https://store.cafe24.com";
  },
  get supportEmail() {
    return process.env.SUPPORT_EMAIL || "";
  },
  /** 테스트에서 가짜 카페24 서버로 바꿔 끼우기 위한 값. 운영에서는 비워 둔다. */
  get cafe24ApiOriginTemplate() {
    return process.env.CAFE24_API_ORIGIN_TEMPLATE || "https://{mall_id}.cafe24api.com";
  },
  get cafe24ApiVersion() {
    return process.env.CAFE24_API_VERSION || "";
  },
  get scopes() {
    const base = ["mall.read_application", "mall.write_application", "mall.read_order"];
    if (this.billingMode === "cafe24") base.push("mall.read_appstore", "mall.write_appstore");
    return base.join(",");
  },
  get secureCookies() {
    return this.appUrl.startsWith("https://");
  },
};
