import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import type { MissingInfoItem } from "@/lib/pe/ma-deal-dashboard";

export function MaDealMissingInfo({ items }: { items: MissingInfoItem[] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">추가 확인 필요</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={item.id} className="flex items-start gap-2 text-sm text-gray-600">
              <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              {item.label}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
