import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import DealDetailClient from "./DealDetailClient";

export default async function DealDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const deal = await prisma.deal.findFirst({
    where: { id: params.id, userId: session.user.id },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
      reports: { orderBy: { generatedAt: "desc" } },
    },
  });

  if (!deal) notFound();

  return <DealDetailClient deal={JSON.parse(JSON.stringify(deal))} />;
}
