import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** A count chart, not a score or conversion funnel. Keep the denominator visible. */
export function DistributionPanel({ title, description, rows }: {
  title: string;
  description: string;
  rows: Array<{ label: string; count: number }>;
}) {
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        {total === 0 ? <p className="text-sm text-muted-foreground">표시할 데이터가 없습니다.</p> : (
          <dl className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            {rows.map((row) => (
              <div key={row.label} className="min-w-0 rounded-lg bg-slate-50 p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <dt className="text-xs text-slate-600">{row.label}</dt>
                  <dd className="text-lg font-semibold tabular-nums text-slate-900">{row.count}<span className="ml-1 text-xs font-normal">건</span></dd>
                </div>
                <div aria-hidden="true" className="mt-2 h-1.5 rounded-full bg-slate-200">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${100 * row.count / total}%` }} />
                </div>
              </div>
            ))}
          </dl>
        )}
      </CardContent>
    </Card>
  );
}
