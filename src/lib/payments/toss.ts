export const PLAN_PRICES: Record<string, number> = {
  solo: 99000,
  sector_pro: 290000,
  multi: 790000,
  full: 1490000,
  bio_premium: 1990000,
};

export const PLAN_NAMES: Record<string, string> = {
  solo: "Solo",
  sector_pro: "Sector Pro",
  multi: "Multi-Sector",
  full: "Full-Stack",
  bio_premium: "Bio Premium",
};

export async function confirmBillingPayment(
  authKey: string,
  customerKey: string,
  plan: string
): Promise<{ success: boolean; billingKey?: string; error?: string }> {
  console.log(`Confirming billing for plan: ${plan}`);
  const secretKey = process.env.TOSS_SECRET_KEY;
  if (!secretKey) return { success: false, error: "Toss secret key not configured" };

  const credentials = Buffer.from(`${secretKey}:`).toString("base64");

  try {
    const res = await fetch(
      "https://api.tosspayments.com/v1/billing/authorizations/issue",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${credentials}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ authKey, customerKey }),
      }
    );
    const data = await res.json();
    if (!res.ok) return { success: false, error: data.message };
    return { success: true, billingKey: data.billingKey };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
