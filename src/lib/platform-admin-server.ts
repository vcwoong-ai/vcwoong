import { cache } from "react";
import { getServerSession } from "next-auth";
import { notFound, redirect } from "next/navigation";
import { authOptions } from "./auth";
import { prisma } from "./prisma";
import { isPlatformAdminAccount } from "./platform-admin";

/** 레이아웃과 페이지가 병렬 렌더링될 수 있으므로 각 페이지에서도 확인한다. */
export const requirePlatformAdmin = cache(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const account = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true },
  });
  if (!isPlatformAdminAccount(account)) notFound();
  return account!;
});
