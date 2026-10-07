import { isEmailConfigured, sendEmail } from "../src/lib/email";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--send") || args.length > 1) {
    console.error("사용법: npm run email:resend-test [-- --send]");
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = process.env.RESEND_TEST_TO?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  if (!isEmailConfigured() || apiKey === "re_xxxxxxxxx" || !to || !from) {
    console.error(
      ".env.resend.local에 실제 RESEND_API_KEY, RESEND_TEST_TO, EMAIL_FROM을 설정하세요.",
    );
    process.exitCode = 1;
    return;
  }

  if (!args.includes("--send")) {
    console.info("Resend 로컬 설정 확인 완료. API 호출·이메일 발송은 수행하지 않았습니다.");
    console.info("테스트 발송: npm run email:resend-test -- --send");
    return;
  }

  const result = await sendEmail({
    from,
    to,
    subject: "Hello World",
    html: "<p>Congrats on sending your <strong>first email</strong>!</p>",
  });
  if (!result.sent) {
    console.error(`Resend 테스트 요청 실패: ${result.reason ?? "unknown"}`);
    process.exitCode = 1;
    return;
  }
  console.info("Resend가 테스트 발송 요청을 수락했습니다. 수신함 도착 여부는 별도로 확인하세요.");
}

void main().catch(() => {
  console.error("Resend 테스트 실행 중 오류가 발생했습니다.");
  process.exitCode = 1;
});
