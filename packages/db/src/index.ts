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

// Runtime values are re-exported by name, never via `export * from`.
// Node 24's require(esm) returns only the star-exported CJS names when this
// module contains `export * from "@prisma/client"`, dropping `prisma` for
// CommonJS consumers (apps/stratum). Types can still be star-exported.
export {
  $Enums,
  BlockStatus,
  OperatorLnType,
  PayoutKind,
  PayoutRule,
  PayoutStatus,
  Prisma,
  PrismaClient,
  TemplateSource,
  Visibility,
} from "@prisma/client";
export type * from "@prisma/client";
