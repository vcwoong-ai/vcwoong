import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/layout/app-layout";
import { TemplatesClient } from "./templates-client";
import { getUserTeamContext, templateReadWhere } from "@/lib/team-access";

export default async function TemplatesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { teamId } = await getUserTeamContext(session.user.id);

  const templatesRaw = await prisma.template.findMany({
    where: templateReadWhere(session.user.id, teamId),
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
