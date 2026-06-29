/**
 * In-memory progress tracking for async report generation.
 * NOTE: works for single-process (local dev / single container).
 * For multi-instance production, replace with Redis/Upstash.
 */

export interface GenerationProgress {
  reportId: string;
  completed: number;
  total: number;
  currentSection: string;
  status: "generating" | "completed" | "error";
  error?: string;
}

const store = new Map<string, GenerationProgress>();

export function initProgress(reportId: string, total: number): void {
  store.set(reportId, {
    reportId,
    completed: 0,
    total,
    currentSection: "준비 중...",
    status: "generating",
  });
}

export function updateProgress(
  reportId: string,
  completed: number,
  currentSection: string
): void {
  const prev = store.get(reportId);
  if (!prev) return;
  store.set(reportId, { ...prev, completed, currentSection });
}

export function completeProgress(reportId: string): void {
  const prev = store.get(reportId);
  if (!prev) return;
  store.set(reportId, {
    ...prev,
    completed: prev.total,
    currentSection: "완료",
    status: "completed",
  });
  // Auto-cleanup after 5 min
  setTimeout(() => store.delete(reportId), 5 * 60 * 1000);
}

export function errorProgress(reportId: string, error: string): void {
  const prev = store.get(reportId);
  if (!prev) return;
  store.set(reportId, { ...prev, status: "error", error });
  setTimeout(() => store.delete(reportId), 5 * 60 * 1000);
}

export function getProgress(reportId: string): GenerationProgress | undefined {
  return store.get(reportId);
}
