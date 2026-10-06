/** Sensitive authenticated responses must not enter browser or shared HTTP caches. */
export const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Cookie",
  "X-Content-Type-Options": "nosniff",
} as const;
