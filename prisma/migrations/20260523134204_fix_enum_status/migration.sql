/*
  Warnings:

  - The `status` column on the `registration_request` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "RegisterStatus" AS ENUM ('pending', 'approved', 'rejected', 'deleted');

-- AlterTable
ALTER TABLE "registration_request" DROP COLUMN "status",
ADD COLUMN     "status" "RegisterStatus" NOT NULL DEFAULT 'pending';

-- CreateIndex
CREATE INDEX "registration_request_status_idx" ON "registration_request"("status");
