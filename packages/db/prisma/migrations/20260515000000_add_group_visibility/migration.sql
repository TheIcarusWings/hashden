-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PUBLIC', 'UNLISTED');

-- AlterTable
ALTER TABLE "Group" ADD COLUMN "visibility" "Visibility" NOT NULL DEFAULT 'PUBLIC';

-- CreateIndex
CREATE INDEX "Group_visibility_idx" ON "Group"("visibility");
