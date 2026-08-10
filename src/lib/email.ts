/**
 * 이메일 발송 (Resend).
 *
 * RESEND_API_KEY가 없으면 실제로 보내지 않고 콘솔에 남긴다. 로컬 개발에서
 * 비밀번호 재설정 링크를 확인할 수 있고, 키를 안 넣었다고 회원가입·재설정
 * 흐름이 깨지지도 않는다.
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
    // 개발 환경에서 링크를 확인할 수 있도록 본문을 그대로 남긴다.
    console.info(
      `[Email] RESEND_API_KEY 미설정 — 발송하지 않음\n  to: ${to}\n  subject: ${subject}\n  body:\n${html}`
    );
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
    });

    if (!res.ok) {
      const body = await res.text();
      console.error(`[Email] 발송 실패 (${res.status}): ${body.slice(0, 300)}`);
      return { sent: false, reason: `http_${res.status}` };
    }
    return { sent: true };
  } catch (error) {
    console.error("[Email] 발송 중 오류:", error);
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
