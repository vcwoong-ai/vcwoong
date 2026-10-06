import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Queries and engine errors can include document text, financial inputs or credentials.
    // Application handlers report fixed identifiers; never forward raw ORM diagnostics.
    log: [],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
