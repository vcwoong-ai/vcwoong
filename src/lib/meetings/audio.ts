import { execFile } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, isAbsolute, relative, resolve } from "node:path";
import { MeetingError, validateAudio, verifyAudioSignature } from "./policy";

export async function probeMeetingAudio(buffer: Buffer, input: { fileName: string; mimeType: string; fileSize: number }, maxSeconds: number) {
  const ext = validateAudio(input);
  if (buffer.length !== input.fileSize) throw new MeetingError("오디오 파일 크기를 확인해주세요.");
  verifyAudioSignature(buffer, ext);
  const executable = process.env.MEETING_FFPROBE_PATH;
  if (!executable || !isAbsolute(executable)) throw new MeetingError("오디오 검증 실행기를 준비해주세요.", 503);
  const dir = await mkdtemp(join(tmpdir(), "dealmind-meeting-"));
  try {
    const file = join(dir, `audio.${ext}`);
    await writeFile(file, buffer, { mode: 0o600, flag: "wx" });
    const output = await new Promise<string>((resolve, reject) => {
      execFile(executable, ["-v", "error", "-max_alloc", "16777216", "-probesize", "1048576",
        "-analyzeduration", "5000000", "-protocol_whitelist", "file", "-enable_drefs", "0", "-use_absolute_path", "0", "-show_entries",
        "format=duration,format_name:stream=codec_type,duration", "-of", "json", file],
      { timeout: 15_000, maxBuffer: 64 * 1024, windowsHide: true }, (error, stdout) => error ? reject(new MeetingError("오디오를 검증하지 못했습니다.")) : resolve(stdout));
    });
    const result = JSON.parse(output) as { format?: { duration?: string; format_name?: string }; streams?: Array<{ codec_type?: string; duration?: string }> };
    const streams = result.streams ?? [];
    const duration = Number(result.format?.duration);
    if (!streams.length || streams.some(stream => stream.codec_type !== "audio") || !Number.isFinite(duration) || duration <= 0
        || duration > maxSeconds || !Number.isSafeInteger(Math.ceil(duration))) throw new MeetingError("오디오 전용 파일과 회의 시간 한도를 확인해주세요.");
    return Math.ceil(duration);
  } finally {
    const target = resolve(dir), child = relative(resolve(tmpdir()), target);
    if (child.startsWith("dealmind-meeting-") && !child.includes("..") && !isAbsolute(child)) await rm(target, { recursive: true, force: true });
  }
}
