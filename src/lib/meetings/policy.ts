import { z } from "zod";

export const MAX_AUDIO_BYTES = 24 * 1024 * 1024;
export const MAX_LOCAL_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_TRANSCRIPT_CHARS = 120_000;
export const TRACKS = ["vc", "pe"] as const;
export type MeetingTrack = typeof TRACKS[number];
export class MeetingError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

const AUDIO_TYPES: Record<string, string[]> = {
  mp3: ["audio/mpeg"], wav: ["audio/wav", "audio/x-wav"],
  m4a: ["audio/mp4", "audio/x-m4a"], mp4: ["audio/mp4"],
  webm: ["audio/webm"], ogg: ["audio/ogg"],
};
export function validateAudio(input: { fileName: string; mimeType: string; fileSize: number }) {
  if (typeof input.fileName !== "string" || !input.fileName || input.fileName.length > 255 || /[\x00-\x1f/\\]/.test(input.fileName)) throw new MeetingError("파일 이름을 확인해주세요.");
  const ext = input.fileName.split(".").pop()?.toLowerCase() ?? "";
  if (!AUDIO_TYPES[ext]?.includes(input.mimeType)) throw new MeetingError("MP3, WAV, M4A, MP4 오디오, WebM, OGG 파일을 선택해주세요.");
  if (!Number.isSafeInteger(input.fileSize) || input.fileSize < 12 || input.fileSize > MAX_AUDIO_BYTES) throw new MeetingError("오디오 파일은 24MiB 이하여야 합니다.");
  return ext;
}
export function verifyAudioSignature(buffer: Buffer, ext: string) {
  const ascii = (start: number, end: number) => buffer.subarray(start, end).toString("ascii");
  const valid = ext === "wav" ? ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE"
    : ext === "mp3" ? ascii(0, 3) === "ID3" || (buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0)
    : ["m4a", "mp4"].includes(ext) ? ascii(4, 8) === "ftyp"
    : ext === "ogg" ? ascii(0, 4) === "OggS"
    : ext === "webm" && buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
  if (!valid) throw new MeetingError("파일 내용과 오디오 형식이 일치하지 않습니다.");
}
export function meetingPolicy(env: NodeJS.ProcessEnv = process.env) {
  const number = (value: string | undefined, max: number) => {
    const result = Number(value); return Number.isSafeInteger(result) && result > 0 && result <= max ? result : 0;
  };
  const monthlyMinutes = number(env.MEETING_MONTHLY_MINUTES, 100_000);
  const maxMinutes = number(env.MEETING_MAX_MINUTES, 60);
  return { enabled: env.MEETING_INTELLIGENCE_ENABLED === "1", monthlyMinutes, maxMinutes,
    configured: monthlyMinutes > 0 && maxMinutes > 0 && maxMinutes <= monthlyMinutes };
}
export function requireMeetingPolicy() {
  const policy = meetingPolicy();
  if (!policy.enabled || !policy.configured) throw new MeetingError("회의 기록 기능을 준비 중입니다.", 503);
  return policy;
}
export function meetingMonth(now: Date) {
  // Existing report quota uses KST months. Keep meeting admissions in the same calendar.
  return new Date(now.getTime() + 9 * 60 * 60_000).toISOString().slice(0, 7);
}
export const newMeetingSchema = z.object({
  requestId: z.string().uuid(), title: z.string().trim().min(1).max(120),
  occurredAt: z.string().datetime(), participants: z.string().trim().max(500),
  uploadMemo: z.string().trim().max(3000).default(""),
  consentConfirmed: z.literal(true), fileName: z.string(), mimeType: z.string(), fileSize: z.number(),
});
export const segmentSchema = z.object({
  start: z.number().finite().nonnegative(), end: z.number().finite().nonnegative(),
  text: z.string().trim().min(1).max(4000),
}).refine(item => item.end >= item.start, "잘못된 전사 시간입니다.");
export const minutesSchema = z.object({
  summary: z.string().trim().min(1).max(12_000),
  claims: z.array(z.object({ text: z.string().trim().min(1).max(1000),
    start: z.number().finite().nonnegative(), end: z.number().finite().nonnegative(),
    verification: z.enum(["UNVERIFIED", "VERIFIED", "NEEDS_DATA"]),
    note: z.string().max(1000),
  }).refine(item => item.end >= item.start)).max(30),
  questions: z.array(z.string().trim().min(1).max(1000)).max(30),
  actions: z.array(z.string().trim().min(1).max(1000)).max(30),
});
export type MeetingMinutes = z.infer<typeof minutesSchema>;
export type TranscriptSegment = z.infer<typeof segmentSchema>;
export function parseTranscript(input: unknown, duration: number): TranscriptSegment[] {
  const segments = z.array(segmentSchema).min(1).max(2500).parse(input);
  if (segments.map(item => item.text).join(" ").length > MAX_TRANSCRIPT_CHARS
      || segments.some(item => item.end > duration + 2)) throw new MeetingError("전사 범위를 확인해주세요.");
  return segments;
}
export function validateMinutes(input: unknown, duration: number) {
  const minutes = minutesSchema.parse(input);
  if (minutes.claims.some(item => item.end > duration + 2 || (item.verification === "VERIFIED" && !item.note.trim()))) throw new MeetingError("주장의 녹음 구간과 확인 근거를 입력해주세요.");
  return minutes;
}
