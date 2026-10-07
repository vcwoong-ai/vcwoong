import { prisma } from "./prisma";
import { DEMO_ACCOUNT_EMAIL } from "./demo-access";

/** 항상 고정 데모 소유자만 조회한다. 운영자 자신의 고객 데이터와 합치지 않는다. */
async function demoOwner() {
  return prisma.user.findUnique({ where: { email: DEMO_ACCOUNT_EMAIL }, select: { id: true } });
}

const reportSummary = {
  orderBy: { createdAt: "desc" as const }, take: 1,
  select: { title: true, status: true, _count: { select: { sections: true } } },
};

export async function loadAdminDemoWorkspace() {
  const owner = await demoOwner();
  if (!owner) return null;
  const [vc, pe] = await Promise.all([
    prisma.deal.findMany({
      where: { userId: owner.id }, orderBy: { updatedAt: "desc" }, take: 12,
      select: { id: true, companyName: true, name: true, sector: true, stage: true,
        _count: { select: { documents: true } }, reports: reportSummary },
    }),
    prisma.mADeal.findMany({
      where: { userId: owner.id }, orderBy: { updatedAt: "desc" }, take: 12,
      select: { id: true, companyName: true, name: true, dealType: true, status: true,
        _count: { select: { documents: true } }, reports: reportSummary },
    }),
  ]);
  return { vc, pe };
}

const detailSelect = {
  id: true, companyName: true, name: true,
  documents: { orderBy: { createdAt: "desc" as const }, take: 20,
    select: { name: true, type: true } },
  reports: { orderBy: { createdAt: "desc" as const }, take: 1,
    select: { title: true, status: true,
      sections: { orderBy: { order: "asc" as const }, take: 12,
        select: { id: true, title: true, content: true, status: true } } } },
} as const;

export async function loadAdminDemoDetail(track: string, id: string) {
  if (!["vc", "pe"].includes(track) || !id || id.length > 128) return null;
  const owner = await demoOwner();
  if (!owner) return null;
  const where = { id, userId: owner.id };
  const deal = track === "vc"
    ? await prisma.deal.findFirst({ where, select: detailSelect })
    : await prisma.mADeal.findFirst({ where, select: detailSelect });
  if (!deal) return null;
  return { ...deal, reports: deal.reports.map((report) => ({ ...report,
    sections: report.sections.map((section) => ({ ...section,
      content: section.content.slice(0, 8000), truncated: section.content.length > 8000,
    })),
  })) };
}
