// Sonnet 4.6 pricing: $3/MTok input, $15/MTok output
const INPUT_COST_PER_TOKEN = 3 / 1_000_000;
const OUTPUT_COST_PER_TOKEN = 15 / 1_000_000;

export interface UsageRecord {
  userId: string;
  dealId?: string;
  feature: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: Date;
}

const usageBuffer: UsageRecord[] = [];

export function trackUsage(params: {
  userId: string;
  dealId?: string;
  feature: string;
  inputTokens: number;
  outputTokens: number;
}): UsageRecord {
  const record: UsageRecord = {
    ...params,
    costUsd:
      params.inputTokens * INPUT_COST_PER_TOKEN +
      params.outputTokens * OUTPUT_COST_PER_TOKEN,
    createdAt: new Date(),
  };
  usageBuffer.push(record);
  return record;
}

export function getMonthlyUsage(userId: string): {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
} {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const records = usageBuffer.filter(
    (r) => r.userId === userId && r.createdAt >= startOfMonth
  );

  return records.reduce(
    (acc, r) => ({
      inputTokens: acc.inputTokens + r.inputTokens,
      outputTokens: acc.outputTokens + r.outputTokens,
      costUsd: acc.costUsd + r.costUsd,
    }),
    { inputTokens: 0, outputTokens: 0, costUsd: 0 }
  );
}
