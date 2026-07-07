-- AlterTable
ALTER TABLE "Repository" ADD COLUMN     "ownerToken" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "Repository_ownerToken_idx" ON "Repository"("ownerToken");
