import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { TemplatesClient } from "./templates-client";

export default async function TemplatesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const templatesRaw = await prisma.template.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });

  // Serialize for client component
  const templates = JSON.parse(JSON.stringify(templatesRaw));

  return (
    <AppLayout title="양식 관리">
      <TemplatesClient templates={templates} />
    </AppLayout>
  );
}
