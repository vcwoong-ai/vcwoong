/** Presentation-only window of existing parser output; never evidence verification. */
export const DOCUMENT_TEXT_WINDOW = 3000;
export const DOCUMENT_TEXT_OFFSET_MAX = 500000;

export interface DocumentTextWindow {
  available: boolean;
  text: string;
  start: number;
  end: number;
  hasMore: boolean;
}

export function documentTextWindow(text: string | null, offset: number): DocumentTextWindow {
  const value = text ?? "";
  const start = Math.min(offset, value.length);
  const end = Math.min(start + DOCUMENT_TEXT_WINDOW, value.length);
  return { available: value.length > 0, text: value.slice(start, end), start, end, hasMore: end < value.length };
}
