/*
  Warnings:

  - A unique constraint covering the columns `[handle]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "User" ADD COLUMN "handle" TEXT;

-- CreateTable
CREATE TABLE "ContractorProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "abn" TEXT,
    "serviceAreas" JSONB NOT NULL DEFAULT [],
    "skills" JSONB NOT NULL DEFAULT [],
    "rateType" TEXT,
    "rateAmount" INTEGER,
    "licence" TEXT,
    "insured" BOOLEAN NOT NULL DEFAULT false,
    "insuranceExp" DATETIME,
    "bio" TEXT,
    "portfolio" JSONB NOT NULL DEFAULT [],
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContractorProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ContractorProfile_userId_key" ON "ContractorProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "User_handle_key" ON "User"("handle");
