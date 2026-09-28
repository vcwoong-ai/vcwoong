import { AppLayout } from "@/components/layout/app-layout";
import { SkeletonPage } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <AppLayout title="PE/M&A 딜">
      <SkeletonPage title="PE/M&A 딜" variant="card" count={6} />
    </AppLayout>
  );
}
