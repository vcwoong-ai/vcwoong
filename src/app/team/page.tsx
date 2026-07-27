import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppLayout } from "@/components/layout/app-layout";
import { checkFeature } from "@/lib/plan-gates";
import { TeamPageClient } from "./team-page-client";

export default async function TeamPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");

  const { allowed, message } = await checkFeature(
    session.user.id,
    "teamCollaboration"
  );

  return (
    <AppLayout title="팀">
      <TeamPageClient
        currentUserId={session.user.id}
        planAllowed={allowed}
        lockMessage={message}
      />
    </AppLayout>
  );
}
