// @hashden/db — Prisma client singleton + re-exported types.
//
// Apps should import from this package, not from @prisma/client directly.
// That keeps the boundary clean if we ever switch ORMs.

import { PrismaClient } from "@prisma/client";

declare global {
  // Avoid spawning multiple PrismaClient instances during Next.js HMR.
  // eslint-disable-next-line no-var
  var __hashdenPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__hashdenPrisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__hashdenPrisma = prisma;
}

export * from "@prisma/client";
