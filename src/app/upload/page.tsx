import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { UploadPageClient } from "./upload-page-client";

export default async function UploadPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const deals = await prisma.deal.findMany({
    where: { userId: session.user.id },
    select: { id: true, companyName: true, name: true },
    orderBy: { updatedAt: "desc" },
  });

  return (
    <AppLayout title="파일 업로드">
      <UploadPageClient deals={deals} />
    </AppLayout>
  );
}
