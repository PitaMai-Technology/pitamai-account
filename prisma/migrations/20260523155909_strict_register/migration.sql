/*
  Warnings:

  - A unique constraint covering the columns `[registrationRequestId]` on the table `user` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "user" ADD COLUMN     "registrationRequestId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "user_registrationRequestId_key" ON "user"("registrationRequestId");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_registrationRequestId_fkey" FOREIGN KEY ("registrationRequestId") REFERENCES "registration_request"("id") ON DELETE SET NULL ON UPDATE CASCADE;
