-- CreateTable
CREATE TABLE "registration_request" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "age" INTEGER NOT NULL,
    "discordId" TEXT NOT NULL,
    "agreedToTerms" BOOLEAN NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "registration_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "registration_request_email_key" ON "registration_request"("email");

-- CreateIndex
CREATE INDEX "registration_request_status_idx" ON "registration_request"("status");

-- CreateIndex
CREATE INDEX "registration_request_reviewedBy_idx" ON "registration_request"("reviewedBy");
