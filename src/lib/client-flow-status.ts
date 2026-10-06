/** A missing response is not confirmation of an authenticated session. */
export function isSuccessfulSignIn(result: { ok?: boolean; error?: string | null } | undefined | null): boolean {
  return result?.ok === true && !result.error;
}

export async function withCleanup<T>(operation: () => Promise<T>, cleanup: () => void): Promise<T> {
  try { return await operation(); } finally { cleanup(); }
}

export function uploadRejectionMessage(rejections: ReadonlyArray<{ file: { name: string }; errors: ReadonlyArray<{ code: string }> }>): string {
  return rejections.map(({ file, errors }) => {
    const reasons = Array.from(new Set(errors.map(({ code }) => code === "file-too-large"
      ? "최대 50MB까지 업로드할 수 있습니다"
      : code === "file-invalid-type" ? "지원하지 않는 파일 형식입니다"
      : "파일을 업로드할 수 없습니다")));
    return `${file.name}: ${reasons.join(" · ")}`;
  }).join("\n");
}
