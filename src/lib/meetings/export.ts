import { validateMinutes } from "./policy";

export function meetingExport(meeting: { title: string; occurredAt: Date; participants: string; uploadMemo?: string;
  version: number; durationSeconds: number | null; approvedAt: Date | null; minutes: string | null }) {
  const minutes = validateMinutes(JSON.parse(meeting.minutes ?? "null"), meeting.durationSeconds ?? 0);
  const text = (value: string) => value.replace(/\x00/g, "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
  const memo = meeting.uploadMemo ? `## 심사역 메모 · 업로드 시 입력\n\n녹음 전사와 별도로 입력한 참고 메모입니다. 녹음된 발언이나 검증된 사실이 아닙니다.\n\n${text(meeting.uploadMemo).split("\n").map(line => `> ${line}`).join("\n")}\n\n` : "";
  return `# ${text(meeting.title)}\n\n일시: ${meeting.occurredAt.toISOString()}\n참가자(사용자 입력): ${text(meeting.participants)}\n회의록 버전: ${meeting.version}\n검토 확정: ${meeting.approvedAt?.toISOString() ?? ""}\n\n` +
    `이 회의록은 녹음 전사와 사용자 검토에 기반합니다. 검토 확정은 회의록 내용의 확인이며, 회사 발언이나 투자 타당성에 대한 독립적인 검증을 뜻하지 않습니다.\n\n## 회의록\n\n${text(minutes.summary)}\n\n## 투자 검토 참고 주장\n\n` +
    minutes.claims.map(item => `- [${time(item.start)}–${time(item.end)}] ${text(item.text)}\n  상태: ${item.verification === "VERIFIED" ? "사용자 확인" : item.verification === "NEEDS_DATA" ? "보완 자료 필요" : "회사 발언 · 미검증"}\n  근거·확인할 자료: ${text(item.note)}`).join("\n\n") +
    `\n\n${memo}` +
    `\n\n## 미확인 사항\n\n${minutes.questions.map(item => `- ${text(item)}`).join("\n")}\n\n## 다음 행동과 보완 자료\n\n${minutes.actions.map(item => `- ${text(item)}`).join("\n")}\n`;
}
