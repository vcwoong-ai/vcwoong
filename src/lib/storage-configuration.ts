/** Configuration summary only; this does not verify remote access policies. */
export interface StorageConfiguration {
  [key: string]: string | undefined;
  STORAGE_MODE?: string;
  BLOB_READ_WRITE_TOKEN?: string;
  BLOB_STORE_ID?: string;
  BLOB_STORE_ACCESS?: string;
  BLOB_LEGACY_PUBLIC_STORE_IDS?: string;
}

export function resolveStorageMode(env: StorageConfiguration): string {
  return env.STORAGE_MODE ?? (env.BLOB_READ_WRITE_TOKEN ? "vercel-blob" : "local");
}

export function storageConfigurationSummary(env: StorageConfiguration): { label: string; description: string } {
  const mode = resolveStorageMode(env);
  if (mode === "vercel-blob") {
    const storeId = (env.BLOB_STORE_ID ?? env.BLOB_READ_WRITE_TOKEN?.match(/^vercel_blob_rw_([A-Za-z0-9]+)_/)?.[1])?.replace(/^store_/, "");
    const configured = Boolean(env.BLOB_READ_WRITE_TOKEN && storeId && /^[A-Za-z0-9]+$/.test(storeId) && env.BLOB_STORE_ACCESS === "private");
    return configured
      ? { label: "Vercel Blob · 비공개 구성", description: "새 문서는 비공개 저장소에 저장하고, 다운로드 시 접근 권한을 확인합니다. 기존 공개 파일의 비공개 전환은 별도 확인이 필요합니다." }
      : { label: "Vercel Blob · 설정 확인 필요", description: "비공개 저장소 연결이 완전하지 않아 새 문서 업로드를 사용할 수 없습니다. 서비스 관리자에게 문의해 주세요." };
  }
  if (mode === "s3") return { label: "AWS S3", description: "문서 다운로드 시 접근 권한을 확인합니다. 저장소의 공개 접근 정책은 별도 확인이 필요합니다." };
  if (mode === "local" || mode === "") return { label: "로컬 개발 저장소", description: "현재 문서는 로컬 파일에 저장됩니다. 운영 서비스에는 영구 저장소 연결이 필요합니다." };
  return { label: "저장소 설정 확인 필요", description: "문서 저장소 설정을 확인해야 합니다. 서비스 관리자에게 문의해 주세요." };
}
