/**
 * 딜소싱 이메일 인입 파서.
 *
 * IR 메일을 그대로 붙여넣으면 기업명·담당자·연락처·본문을 추출해
 * InboundDeal 등록 페이로드로 변환한다. AI 없이 동작한다.
 */

import { DealSector, DealSourceType } from "@prisma/client";
import { guessSector } from "@/lib/sourcing";

export interface ParsedEmailLead {
  companyName: string;
  sector: DealSector;
  source: DealSourceType;
  contactName: string | null;
  contactEmail: string | null;
  summary: string;
  rawText: string;
  /** 기업명을 헤더/제목에서 확신을 갖고 뽑았는지 — false면 사용자 확인 권장 */
  companyNameConfident: boolean;
}

const FORWARD_SEPARATOR =
  /^-{2,}\s*(?:Forwarded message|전달된 메시지|원본 메시지|Original Message)\s*-{2,}$/gim;

const HEADER_PATTERNS = {
  from: /^(?:from|보낸사람|발신|보낸 사람)\s*[:：]\s*(.+)$/im,
  subject: /^(?:subject|제목)\s*[:：]\s*(.+)$/im,
  to: /^(?:to|받는사람|수신|받는 사람)\s*[:：]\s*(.+)$/im,
  date: /^(?:date|sent|날짜|보낸날짜)\s*[:：]\s*(.+)$/im,
};

const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;

/** 회사를 나타내지 않는 흔한 메일 도메인 */
const GENERIC_DOMAINS = new Set([
  "gmail.com",
  "naver.com",
  "daum.net",
  "hanmail.net",
  "kakao.com",
  "nate.com",
  "outlook.com",
  "hotmail.com",
  "yahoo.com",
  "icloud.com",
  "protonmail.com",
]);

const SOURCE_HINTS: Array<{ pattern: RegExp; source: DealSourceType }> = [
  { pattern: /데모\s*데이|demo\s*day|ir\s*데이/i, source: DealSourceType.DEMO_DAY },
  { pattern: /액셀러레이터|accelerator|배치|batch|프라이머|스파크랩/i, source: DealSourceType.ACCELERATOR },
  { pattern: /소개(?:로|해|드립니다)|추천(?:으로|받아)|referral|건너\s*소개/i, source: DealSourceType.REFERRAL },
  { pattern: /파트너사|공동\s*투자|co-?invest/i, source: DealSourceType.PARTNER },
];

/** 여러 통이 붙어 있으면 전달 구분선 기준으로 나눈다 */
export function splitEmailThreads(raw: string): string[] {
  const parts = raw
    .split(FORWARD_SEPARATOR)
    .map((p) => p.trim())
    .filter((p) => p.length > 20);
  return parts.length > 0 ? parts : [raw.trim()].filter(Boolean);
}

function headerValue(text: string, key: keyof typeof HEADER_PATTERNS): string {
  return HEADER_PATTERNS[key].exec(text)?.[1]?.trim() ?? "";
}

/** "홍길동 <hong@startup.kr>" → { name, email } */
function parseAddress(value: string): { name: string | null; email: string | null } {
  const email = EMAIL_RE.exec(value)?.[0] ?? null;
  const name = value
    .replace(/<[^>]*>/g, "")
    .replace(EMAIL_RE, "")
    .replace(/["'()]/g, "")
    .trim();
  return { name: name || null, email };
}

/** 이메일 도메인에서 회사명 후보를 만든다 (일반 메일 도메인은 제외) */
function companyFromEmail(email: string | null): string | null {
  if (!email) return null;
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain || GENERIC_DOMAINS.has(domain)) return null;
  const label = domain.split(".")[0];
  if (!label || label.length < 2) return null;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * 제목에서 기업명을 추출한다.
 * "[그린루프] 시리즈A IR 자료 송부" / "(주)그린루프 투자 제안" 같은 패턴을 노린다.
 */
function companyFromSubject(subject: string): string | null {
  if (!subject) return null;

  const bracket = /^\s*[[(【]\s*([^\])】]{2,30})\s*[\])】]/.exec(subject);
  if (bracket) {
    const inner = bracket[1].trim();
    // "[IR]", "[투자제안]" 같은 말머리는 회사명이 아니다
    if (!/^(ir|투자\s*제안|제안|문의|소개|re|fwd?|회신|전달)$/i.test(inner)) {
      return inner;
    }
  }

  const corp = /((?:\(주\)|㈜|주식회사)\s*[가-힣A-Za-z0-9]{2,20}|[가-힣A-Za-z0-9]{2,20}\s*(?:\(주\)|㈜|주식회사))/.exec(
    subject
  );
  if (corp) return corp[1].trim();

  // "그린루프 시리즈A IR" — 앞쪽 토큰이 회사명인 경우
  const lead = /^\s*([가-힣A-Za-z][가-힣A-Za-z0-9]{1,19})\s+(?:시리즈|seed|pre-?a|ir|투자|사업)/i.exec(
    subject
  );
  if (lead) return lead[1].trim();

  return null;
}

/** 본문에서 서명·인용부호·헤더를 걷어낸 요약용 텍스트 */
function extractBody(text: string): string {
  const withoutHeaders = text
    .split("\n")
    .filter(
      (line) =>
        !/^(?:from|to|cc|bcc|subject|date|sent|reply-to|보낸사람|받는사람|참조|제목|날짜|발신|수신|보낸 사람|받는 사람|보낸날짜)\s*[:：]/i.test(
          line.trim()
        )
    )
    .join("\n");

  // 인용 답장 구간(> 로 시작) 제거
  const withoutQuotes = withoutHeaders
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n");

  // 서명 구분선 이후 절단
  const signatureCut = withoutQuotes.split(/^\s*--\s*$/m)[0];

  return signatureCut.replace(/\n{3,}/g, "\n\n").trim();
}

function detectSource(text: string): DealSourceType {
  for (const { pattern, source } of SOURCE_HINTS) {
    if (pattern.test(text)) return source;
  }
  return DealSourceType.INBOUND;
}

/** 이메일 한 통을 인바운드 딜 페이로드로 변환한다 */
export function parseEmailLead(raw: string): ParsedEmailLead {
  const text = raw.trim();
  const subject = headerValue(text, "subject");
  const from = headerValue(text, "from");
  const { name: fromName, email: fromEmail } = parseAddress(from);

  // From 헤더가 없으면 본문 어디든 있는 첫 이메일 주소를 담당자로 본다
  const contactEmail = fromEmail ?? EMAIL_RE.exec(text)?.[0] ?? null;

  const subjectCompany = companyFromSubject(subject);
  const domainCompany = companyFromEmail(contactEmail);
  const companyName = subjectCompany ?? domainCompany ?? "확인 필요";

  const body = extractBody(text);
  const summary = subject ? `${subject}\n\n${body}` : body;

  return {
    companyName,
    sector: guessSector(`${companyName} ${subject} ${body}`),
    source: detectSource(`${subject} ${body}`),
    contactName: fromName,
    contactEmail,
    summary: summary.slice(0, 4000),
    rawText: text.slice(0, 20000),
    companyNameConfident: subjectCompany !== null,
  };
}

/** 붙여넣은 텍스트 전체를 파싱한다 (전달 메일 여러 통 지원) */
export function parseEmailIntake(raw: string): ParsedEmailLead[] {
  return splitEmailThreads(raw).map(parseEmailLead);
}
