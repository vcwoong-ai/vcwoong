/** Shared browser/server digest of exactly the reviewed report body, never logged. */
export interface ReviewedSection {
  id: string;
  sectionKey: string;
  title: string;
  content: string;
  order: number;
}

export async function reportReviewVersion(sections: readonly ReviewedSection[]): Promise<string> {
  const body = JSON.stringify(["dealmind-reviewed-body-v1", [...sections]
    .sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    .map(({ id, sectionKey, title, content, order }) => [id, sectionKey, title, content, order])]);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
