-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_user" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "deletedAt" DATETIME,
    "lastLoginAt" DATETIME,
    "version" INTEGER NOT NULL DEFAULT 0,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT
);
INSERT INTO "new_user" ("createdAt", "deletedAt", "email", "emailVerified", "id", "image", "lastLoginAt", "name", "password", "role", "updatedAt", "version") SELECT "createdAt", "deletedAt", "email", "emailVerified", "id", "image", "lastLoginAt", "name", "password", "role", "updatedAt", "version" FROM "user";
DROP TABLE "user";
ALTER TABLE "new_user" RENAME TO "user";
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");
CREATE INDEX "user_email_deletedAt_idx" ON "user"("email", "deletedAt");
CREATE INDEX "user_role_deletedAt_idx" ON "user"("role", "deletedAt");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
