// Compile-time check that a real PrismaClient satisfies our PrismaLike
// structural type. If you change PrismaLike's method signatures or rename
// columns in @hashden/db's schema in a way that breaks this contract,
// `tsc --noEmit` here will fail loudly before runtime.
//
// This file has no runtime side effects; it's purely a typecheck assertion.

import type { PrismaClient } from "@hashden/db";
import type { PrismaLike } from "./group-router.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _isCompatible: (c: PrismaClient) => PrismaLike = (c) => c;
