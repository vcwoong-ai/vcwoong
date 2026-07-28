/**
 * 이메일 원문에서 인바운드 딜 정보를 추출한다.
 * .eml, Outlook 붙여넣기, 일반 텍스트 모두 처리.
 */

export interface ParsedEmailLead {
  companyName: string | null;
  contactName: string | null;
  contactEmail: string | null;
  subject: string | null;
  summary: string | null;
  rawText: string;
}

const COMPANY_PATTERNS = [
  /(?:회사|기업|스타트업|startup)[:\s]*([가-힣A-Za-z0-9&]{2,20})/i,
  /(?:from|발신)[:\s]*(.+?)(?:<|$)/i,
  /\[([가-힣A-Za-z0-9&.\s]{2,30})\]/,
  /^([가-힣A-Za-z0-9&.\s]{2,30})\s*(?:IR|투자|미팅|소개)/im,
];

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

function stripHeaders(text: string): string {
  const lines = text.split(/\r?\n/);
  const bodyStart = lines.findIndex((l, i) => {
    if (i > 0 && lines[i - 1].trim() === "" && !/^[A-Za-z-]+:/.test(l)) {
      return true;
    }
    return false;
  });
  if (bodyStart > 2) return lines.slice(bodyStart).join("\n").trim();
  return text.trim();
}

function extractSubject(text: string): string | null {
  const match = text.match(/^Subject:\s*(.+)$/im);
  return match?.[1]?.trim() ?? null;
}

function extractFromName(text: string): string | null {
  const fromMatch = text.match(/^From:\s*(.+)$/im);
  if (!fromMatch) return null;
  const from = fromMatch[1].trim();
  const nameMatch = from.match(/^([^<]+)</);
  if (nameMatch) return nameMatch[1].trim().replace(/"/g, "");
  return from.includes("@") ? null : from;
}

function extractFromEmail(text: string): string | null {
  const fromMatch = text.match(/^From:\s*(.+)$/im);
  const source = fromMatch?.[1] ?? text;
  const emails = source.match(EMAIL_REGEX);
  return emails?.[0] ?? null;
}

function cleanCompanyName(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/(입니다|입니다\.| Inc\.?| Co\.?| Corp\.?| Ltd\.?)$/i, "")
    .trim()
    .slice(0, 40);
}

function guessCompanyName(text: string, subject: string | null): string | null {
  if (subject) {
    const bracket = subject.match(/\[([가-힣A-Za-z0-9&.\s]{2,25})\]/);
    if (bracket?.[1]) return cleanCompanyName(bracket[1]);

    const subjMatch = subject.match(
      /(?:\[|\()?([가-힣A-Za-z0-9&.\s]{2,25})(?:\]|\))?\s*(?:IR|투자|미팅|소개|deck)/i
    );
    if (subjMatch?.[1]) return cleanCompanyName(subjMatch[1]);
  }

  for (const pattern of COMPANY_PATTERNS) {
    const m = text.match(pattern);
    if (m?.[1]?.trim()) {
      const name = cleanCompanyName(m[1]);
      if (name.length >= 2) return name;
    }
  }

  return null;
}

function buildSummary(body: string, maxLen = 500): string {
  const cleaned = body
    .replace(/^>.*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return cleaned.slice(0, maxLen);
}

/**
 * 이메일 원문(.eml 또는 붙여넣기)을 파싱해 리드 필드를 추출.
 */
export function parseInboundEmail(raw: string): ParsedEmailLead {
  const text = raw.trim();
  const subject = extractSubject(text);
  const body = stripHeaders(text);
  const contactEmail = extractFromEmail(text);
  const contactName = extractFromName(text);
  const companyName = guessCompanyName(body, subject);

  return {
    companyName,
    contactName,
    contactEmail,
    subject,
    summary: buildSummary(body),
    rawText: text,
  };
}
