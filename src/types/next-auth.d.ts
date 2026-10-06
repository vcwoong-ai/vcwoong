import { UserRole } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role?: UserRole;
    };
  }

  interface User {
    role?: UserRole;
    /** Server-only; omitted from the public Session object. */
    authSessionVersion?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role?: UserRole;
    authSessionVersion?: string;
  }
}
