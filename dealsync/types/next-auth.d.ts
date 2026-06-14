import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      firm?: string | null;
      role?: string | null;
    };
  }

  interface User {
    id: string;
    firm?: string | null;
    role?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    firm?: string | null;
    role?: string | null;
  }
}
