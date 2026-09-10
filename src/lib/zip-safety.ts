/**
 * 압축 해제 폭탄(zip bomb) 방어.
 *
 * DOCX/PPTX는 zip 구조라, 업로드 크기 자체는 50MB로 제한돼 있어도 그 안의
 * 항목 하나가 극단적인 압축률(수백~수천 배)로 부풀도록 조작되면 서버리스
 * 함수의 메모리를 다 써버릴 수 있다. JSZip은 zip의 중앙 디렉터리에 적힌
 * "압축 해제 후 크기"를 실제로 압축을 풀기 전에도 알고 있으므로
 * (`ZipObject._data.uncompressedSize`), 그 값으로 먼저 상한을 확인한 뒤에만
 * `.async(...)`로 실제 압축 해제를 수행한다.
 */

/** JSZip의 내부 필드라 공식 타입이 없다 — 있으면 쓰고 없으면 통과시킨다(fail-open). */
interface ZipObjectWithSize {
  _data?: { uncompressedSize?: number };
  async(type: "text"): Promise<string>;
  async(type: "nodebuffer"): Promise<Buffer>;
}

/**
 * 압축 해제 후 크기가 `maxBytes`를 넘는 항목은 읽지 않고 null을 돌려준다.
 * 크기 정보 자체를 알 수 없는 경우(내부 필드가 없는 예외적 상황)는 안전하게
 * 통과시킨다 — 정상 파일까지 막는 게 더 큰 손해다.
 */
export async function readZipEntrySafe(
  entry: ZipObjectWithSize | null | undefined,
  type: "text",
  maxBytes: number
): Promise<string | null>;
export async function readZipEntrySafe(
  entry: ZipObjectWithSize | null | undefined,
  type: "nodebuffer",
  maxBytes: number
): Promise<Buffer | null>;
export async function readZipEntrySafe(
  entry: ZipObjectWithSize | null | undefined,
  type: "text" | "nodebuffer",
  maxBytes: number
): Promise<string | Buffer | null> {
  if (!entry) return null;
  const size = entry._data?.uncompressedSize;
  if (typeof size === "number" && size > maxBytes) {
    console.warn(
      `[ZipSafety] 압축 해제 후 크기(${size} bytes)가 상한(${maxBytes} bytes)을 넘어 건너뜀`
    );
    return null;
  }
  return type === "text" ? entry.async("text") : entry.async("nodebuffer");
}
