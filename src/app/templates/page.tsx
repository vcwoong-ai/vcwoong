import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccessScope, ownedOrShared } from "@/lib/team";
import { AppLayout } from "@/components/layout/app-layout";
import { TemplatesClient } from "./templates-client";

export default async function TemplatesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const scope = await getAccessScope(session.user.id);

  const templatesRaw = await prisma.template.findMany({
    where: ownedOrShared(scope),
    orderBy: { createdAt: "desc" },
  });

  // Serialize for client component
  const templates = JSON.parse(JSON.stringify(templatesRaw));

  return (
    <AppLayout title="양식 관리">
      <TemplatesClient
        templates={templates}
        currentUserId={session.user.id}
        hasTeam={scope.teamId !== null}
      />
    </AppLayout>
  );
}
