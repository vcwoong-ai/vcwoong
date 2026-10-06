/**
 * 이메일 발송 (Resend).
 *
 * 미설정·발송 실패를 결과로 반환한다. 수신자, 본문과 재설정 링크는
 * 개발 환경에서도 로그에 남기지 않는다.
 */

import { BRAND } from "@/lib/brand";

const RESEND_API = "https://api.resend.com/emails";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  /** 발신 주소. 미설정 시 EMAIL_FROM → Resend 기본 도메인 순 */
  from?: string;
}

export async function sendEmail({
  to,
  subject,
  html,
  from,
}: SendEmailInput): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();

  if (!apiKey) {
    console.info("[Email] 발송 서비스 미설정 — 발송하지 않음");
    return { sent: false, reason: "not_configured" };
  }

  const sender =
    from ?? process.env.EMAIL_FROM?.trim() ?? `${BRAND.name} <onboarding@resend.dev>`;

  try {
    const res = await fetch(RESEND_API, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: sender, to: [to], subject, html }),
      // 메일 발송이 매달려서 가입·비밀번호 재설정 요청 전체가 함수
      // 실행시간까지 끌려가면 안 된다 — 실패해도 상위 흐름은 계속된다.
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      // 제공자 오류 본문에도 주소나 요청 정보가 포함될 수 있다.
      console.error(`[Email] 발송 실패 (${res.status})`);
      return { sent: false, reason: `http_${res.status}` };
    }
    return { sent: true };
  } catch {
    console.error("[Email] 발송 중 오류");
    return { sent: false, reason: "exception" };
  }
}

/** 비밀번호 재설정 메일 본문 */
export function passwordResetEmail(resetUrl: string, expiresMinutes: number): string {
  return `
    <div style="font-family: system-ui, -apple-system, 'Malgun Gothic', sans-serif; max-width: 480px;">
      <h2 style="color:#111827;font-size:20px;margin:0 0 12px;">비밀번호 재설정</h2>
      <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 20px;">
        아래 버튼을 눌러 새 비밀번호를 설정하세요.
        이 링크는 <strong>${expiresMinutes}분</strong> 동안만 유효합니다.
      </p>
      <p style="margin:0 0 24px;">
        <a href="${resetUrl}"
           style="display:inline-block;padding:10px 18px;border-radius:6px;background:#2563eb;color:#fff;text-decoration:none;font-size:14px;">
          비밀번호 재설정
        </a>
      </p>
      <p style="color:#6b7280;font-size:12px;line-height:1.6;margin:0;">
        본인이 요청하지 않았다면 이 메일을 무시하세요. 비밀번호는 변경되지 않습니다.<br />
        버튼이 동작하지 않으면 아래 주소를 브라우저에 붙여넣으세요.<br />
        <span style="word-break:break-all;">${resetUrl}</span>
      </p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
      <p style="color:#9ca3af;font-size:12px;margin:0;">${BRAND.name} · ${BRAND.tagline}</p>
    </div>
  `;
}
