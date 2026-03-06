/*
  Warnings:

  - You are about to drop the `mail_account` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `mail_cache` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `user_gpg_key` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `wiki` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "mail_account" DROP CONSTRAINT "mail_account_userId_fkey";

-- DropForeignKey
ALTER TABLE "mail_cache" DROP CONSTRAINT "mail_cache_accountId_fkey";

-- DropForeignKey
ALTER TABLE "user_gpg_key" DROP CONSTRAINT "user_gpg_key_userId_fkey";

-- DropForeignKey
ALTER TABLE "wiki" DROP CONSTRAINT "wiki_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "wiki" DROP CONSTRAINT "wiki_userId_fkey";

-- DropTable
DROP TABLE "mail_account";

-- DropTable
DROP TABLE "mail_cache";

-- DropTable
DROP TABLE "user_gpg_key";

-- DropTable
DROP TABLE "wiki";
