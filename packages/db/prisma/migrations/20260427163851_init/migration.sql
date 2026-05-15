-- CreateEnum
CREATE TYPE "PayoutRule" AS ENUM ('SOLO_SHOWCASE', 'PPLNS');

-- CreateEnum
CREATE TYPE "TemplateSource" AS ENUM ('PLATFORM_DEFAULT', 'OPERATOR_RPC');

-- CreateEnum
CREATE TYPE "OperatorLnType" AS ENUM ('LNBITS', 'NWC');

-- CreateEnum
CREATE TYPE "BlockStatus" AS ENUM ('FOUND', 'ORPHANED', 'MATURED', 'DUST_FANNED_OUT');

-- CreateEnum
CREATE TYPE "PayoutKind" AS ENUM ('ON_CHAIN_COINBASE', 'LN_DUST');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'IN_FLIGHT', 'PAID', 'FAILED');

-- CreateTable
CREATE TABLE "Group" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "operatorPubkey" TEXT NOT NULL,
    "operatorBtcAddress" TEXT NOT NULL,
    "feeBps" INTEGER NOT NULL,
    "payoutRule" "PayoutRule" NOT NULL,
    "templateSource" "TemplateSource" NOT NULL DEFAULT 'PLATFORM_DEFAULT',
    "operatorRpcUrl" TEXT,
    "operatorRpcAuth" TEXT,
    "operatorLnType" "OperatorLnType",
    "operatorLnSecret" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Group_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "groupId" TEXT NOT NULL,
    "memberPubkey" TEXT NOT NULL,
    "btcAddress" TEXT NOT NULL,
    "lightningAddress" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("groupId","memberPubkey")
);

-- CreateTable
CREATE TABLE "Share" (
    "id" BIGSERIAL NOT NULL,
    "groupId" TEXT NOT NULL,
    "memberPubkey" TEXT NOT NULL,
    "difficulty" DOUBLE PRECISION NOT NULL,
    "ts" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Block" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "height" INTEGER NOT NULL,
    "hash" TEXT NOT NULL,
    "rewardSats" BIGINT NOT NULL,
    "status" "BlockStatus" NOT NULL,
    "coinbaseOutputs" JSONB NOT NULL,
    "foundAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "maturedAt" TIMESTAMP(3),

    CONSTRAINT "Block_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutAttempt" (
    "id" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    "memberPubkey" TEXT NOT NULL,
    "amountSats" BIGINT NOT NULL,
    "kind" "PayoutKind" NOT NULL,
    "status" "PayoutStatus" NOT NULL,
    "lnPaymentHash" TEXT,
    "zapEventId" TEXT,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Group_slug_key" ON "Group"("slug");

-- CreateIndex
CREATE INDEX "Group_operatorPubkey_idx" ON "Group"("operatorPubkey");

-- CreateIndex
CREATE INDEX "Member_memberPubkey_idx" ON "Member"("memberPubkey");

-- CreateIndex
CREATE INDEX "Share_groupId_ts_idx" ON "Share"("groupId", "ts" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Block_hash_key" ON "Block"("hash");

-- CreateIndex
CREATE INDEX "Block_status_maturedAt_idx" ON "Block"("status", "maturedAt");

-- CreateIndex
CREATE INDEX "Block_groupId_foundAt_idx" ON "Block"("groupId", "foundAt" DESC);

-- CreateIndex
CREATE INDEX "PayoutAttempt_status_idx" ON "PayoutAttempt"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutAttempt_blockId_memberPubkey_kind_key" ON "PayoutAttempt"("blockId", "memberPubkey", "kind");

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Block" ADD CONSTRAINT "Block_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutAttempt" ADD CONSTRAINT "PayoutAttempt_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block"("id") ON DELETE CASCADE ON UPDATE CASCADE;
