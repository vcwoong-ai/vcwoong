/** Format checks only. Matching mode does not prove MID, contract, permissions or connectivity. */
export type TossMode = "test" | "live";
export type TossConfiguration =
  | { ready: true; mode: TossMode; reason: "MATCHING_MODE" }
  | { ready: false; mode: null; reason: "MISSING_KEYS" | "UNSUPPORTED_KEYS" | "MIXED_MODES" };

export function inspectTossConfiguration(env: Record<string, string | undefined>): TossConfiguration {
  const client = env.NEXT_PUBLIC_TOSS_CLIENT_KEY;
  const secret = env.TOSS_SECRET_KEY;
  if (!client || !secret) return { ready: false, mode: null, reason: "MISSING_KEYS" };
  // This application uses the individual billing keys, not payment-widget keys.
  const clientMode = /^(test|live)_ck_[A-Za-z0-9_-]+$/.exec(client)?.[1] as TossMode | undefined;
  const secretMode = /^(test|live)_sk_[A-Za-z0-9_-]+$/.exec(secret)?.[1] as TossMode | undefined;
  if (!clientMode || !secretMode) return { ready: false, mode: null, reason: "UNSUPPORTED_KEYS" };
  if (clientMode !== secretMode) return { ready: false, mode: null, reason: "MIXED_MODES" };
  return { ready: true, mode: clientMode, reason: "MATCHING_MODE" };
}
