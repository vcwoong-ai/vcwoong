/**
 * fetch 응답을 안전하게 JSON으로 파싱한다.
 *
 * `response.json()`을 조건 없이 부르면, 서버 함수가 실행시간 상한(Vercel
 * Hobby maxDuration)에 걸려 죽거나 네트워크가 중간에 끊겼을 때 body가
 * 비어 있거나 JSON이 아닌 상태로 도착할 수 있다 — 이때 `.json()`은
 * "Unexpected end of JSON input" 같은 원본 파서 에러를 그대로 던지고,
 * 그 문구가 그대로 사용자 화면에 노출된다(개선 사항이 아니라 방지 대상).
 *
 * status만으로는 이 상황을 구분할 수 없다(타임아웃이 200으로 오다가
 * 끊기는 경우도 있다) — 그래서 response.ok가 아니라 실제 body를
 * text()로 먼저 받아 비어있는지/JSON인지부터 확인한다.
 */
export type SafeFetchResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string };

export async function safeReadJson<T = unknown>(
  response: Response,
  emptyBodyMessage = "서버 응답이 지연되어 작업이 중단되었습니다. 완료된 부분은 저장되어 있습니다."
): Promise<SafeFetchResult<T>> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return { ok: false, status: response.status, message: emptyBodyMessage };
  }

  if (!text.trim()) {
    return { ok: false, status: response.status, message: emptyBodyMessage };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, status: response.status, message: emptyBodyMessage };
  }

  if (!response.ok) {
    const message =
      json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string"
        ? (json as { error: string }).error
        : `요청이 실패했습니다 (HTTP ${response.status})`;
    return { ok: false, status: response.status, message };
  }

  return { ok: true, data: json as T };
}
