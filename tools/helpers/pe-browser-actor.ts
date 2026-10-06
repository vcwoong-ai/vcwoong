import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { assertE2ETarget, assertNoExternalE2ECredentials, assertCleanE2EWorkspace } from "./e2e-environment";

/** Disposable actor restricted to the explicit loopback test database. Never log credentials. */
export async function createPEBrowserActor(prisma: PrismaClient) {
  assertE2ETarget(process.env.BASE_URL ?? process.env.E2E_TEST_URL ?? "http://localhost:3000");
  assertNoExternalE2ECredentials();
  assertCleanE2EWorkspace();
  const token = randomUUID();
  const password = `Synthetic-${randomUUID()}!`;
  const passwordHash = await hash(password, 10);
  const team = await prisma.team.create({ data: { name: `PE browser synthetic ${token}` } });
  try {
    const user = await prisma.user.create({
      data: { email: `pe-browser-${token}@example.com`, name: "합성 PE 검토자", passwordHash, role: "PARTNER", teamRole: "PARTNER", teamId: team.id },
      select: { id: true, email: true, teamId: true },
    });
    return {
      user: { ...user, email: user.email! }, password,
      async cleanup() {
        assertE2ETarget(process.env.BASE_URL ?? process.env.E2E_TEST_URL ?? "http://localhost:3000");
        await prisma.$transaction([
          prisma.mADeal.deleteMany({ where: { userId: user.id } }),
          prisma.user.deleteMany({ where: { id: user.id, teamId: team.id } }),
          prisma.team.deleteMany({ where: { id: team.id } }),
        ]);
        const remaining = await prisma.user.count({ where: { id: user.id } }) +
          await prisma.team.count({ where: { id: team.id } }) +
          await prisma.mADeal.count({ where: { userId: user.id } });
        if (remaining !== 0) throw new Error("Synthetic PE actor cleanup incomplete");
        console.log("PASS synthetic PE actor cleanup");
      },
    };
  } catch {
    await prisma.team.deleteMany({ where: { id: team.id } });
    throw new Error("Synthetic PE actor creation failed");
  }
}
